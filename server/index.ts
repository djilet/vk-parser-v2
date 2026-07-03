import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { getTokenByUserId, isTokenExpired, loadAllTokens } from '../src/token/index.js';
import { loadPinnedPeerIds, setPeerPinned } from '../src/pins/store.js';
import { getConversations, getConversationsById, getHistory, getUsers, markPeerAsRead, sendMessage, type VkConversationFilter } from '../src/vk/api.js';
import { mapConversationToSummary } from '../src/vk/conversation-summary.js';
import { formatMessages } from '../src/vk/message-format.js';
import { suggestReply, type ChatMessageForSuggestion } from '../src/ollama/suggest-reply.js';

const PORT = Number(process.env.PORT ?? 3001);
const DEFAULT_CHAT_LIMIT = 20;
const MAX_CHAT_LIMIT = 200;
const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 200;

type JsonBody = Record<string, unknown>;

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<JsonBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as JsonBody);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function parseAccountId(value: string | null): number {
  const accountId = Number(value);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error('accountId must be a positive integer');
  }

  return accountId;
}

function parsePeerId(value: string): number {
  const peerId = Number(value);

  if (!Number.isInteger(peerId) || peerId === 0) {
    throw new Error('peerId must be a non-zero integer');
  }

  return peerId;
}

function parseLimit(
  value: string | null,
  defaultLimit = DEFAULT_CHAT_LIMIT,
  maxLimit = MAX_CHAT_LIMIT,
): number {
  const limit = value ? Number(value) : defaultLimit;

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new Error(`limit must be an integer between 1 and ${maxLimit}`);
  }

  return limit;
}

function parseOffset(value: string | null): number {
  const offset = value ? Number(value) : 0;

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('offset must be a non-negative integer');
  }

  return offset;
}

function parseConversationFilter(value: string | null): VkConversationFilter {
  const filter = value ?? 'all';

  if (filter !== 'all' && filter !== 'unread' && filter !== 'important' && filter !== 'unanswered') {
    throw new Error('filter must be all, unread, important, or unanswered');
  }

  return filter;
}

async function handleAccounts(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const tokens = await loadAllTokens();
  const activeTokens = tokens.filter((token) => token.userId && !isTokenExpired(token));
  const profilesById = new Map<number, { first_name: string; last_name: string }>();

  if (activeTokens.length > 0) {
    try {
      const userIds = [...new Set(activeTokens.map((token) => token.userId!))];
      const profiles = await getUsers(activeTokens[0].accessToken, userIds);

      for (const profile of profiles ?? []) {
        profilesById.set(profile.id, {
          first_name: profile.first_name,
          last_name: profile.last_name,
        });
      }
    } catch {
      // fall back to email / token label in the UI
    }
  }

  sendJson(
    res,
    200,
    tokens.map((token) => {
      const profile = token.userId ? profilesById.get(token.userId) : undefined;

      return {
        userId: token.userId,
        email: token.email,
        firstName: profile?.first_name,
        lastName: profile?.last_name,
        browserId: token.browserId,
        expired: isTokenExpired(token),
      };
    }),
  );
}

async function handleConversations(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const accountId = parseAccountId(url.searchParams.get('accountId'));
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = parseOffset(url.searchParams.get('offset'));
  const filter = parseConversationFilter(url.searchParams.get('filter'));
  const token = await getTokenByUserId(accountId);

  const data = await getConversations(token.accessToken, limit, offset, filter);
  const profiles = data.profiles ?? [];
  const groups = data.groups ?? [];

  const chats = data.items.map((item) => mapConversationToSummary(item, profiles, groups));

  sendJson(res, 200, { accountId, chats, total: data.count, offset, limit, filter });
}

async function handleGetPinnedChats(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const accountId = parseAccountId(url.searchParams.get('accountId'));
  await getTokenByUserId(accountId);

  const peerIds = await loadPinnedPeerIds(accountId);
  sendJson(res, 200, { accountId, peerIds });
}

async function handleGetPinnedConversations(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const accountId = parseAccountId(url.searchParams.get('accountId'));
  const token = await getTokenByUserId(accountId);
  const peerIds = await loadPinnedPeerIds(accountId);

  if (peerIds.length === 0) {
    sendJson(res, 200, { accountId, chats: [] });
    return;
  }

  const data = await getConversationsById(token.accessToken, peerIds);
  const profiles = data.profiles ?? [];
  const groups = data.groups ?? [];
  const chatsByPeerId = new Map<number, ReturnType<typeof mapConversationToSummary>>();

  for (const item of data.items) {
    const chat = mapConversationToSummary(item, profiles, groups);
    chatsByPeerId.set(chat.peerId, chat);
  }

  const chats = peerIds
    .map((peerId) => chatsByPeerId.get(peerId))
    .filter((chat): chat is NonNullable<typeof chat> => chat != null);

  sendJson(res, 200, { accountId, chats });
}

async function handleSetChatPin(
  req: IncomingMessage,
  res: ServerResponse,
  peerId: number,
): Promise<void> {
  const body = await readBody(req);
  const accountId = parseAccountId(String(body.accountId ?? ''));
  const pinned = body.pinned === true;

  await getTokenByUserId(accountId);
  const peerIds = await setPeerPinned(accountId, peerId, pinned);

  sendJson(res, 200, { accountId, peerId, pinned, peerIds });
}

async function handleGetMessages(
  req: IncomingMessage,
  res: ServerResponse,
  peerId: number,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const accountId = parseAccountId(url.searchParams.get('accountId'));
  const limit = parseLimit(url.searchParams.get('limit'), DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT);
  const offset = parseOffset(url.searchParams.get('offset'));
  const token = await getTokenByUserId(accountId);

  const history = await getHistory(token.accessToken, peerId, limit, offset);
  const messages = formatMessages(history.items);

  let markedRead = false;
  if (offset === 0) {
    try {
      markedRead = await markPeerAsRead(token.accessToken, peerId);
    } catch {
      // keep chat usable even if VK mark-as-read fails
    }
  }

  sendJson(res, 200, {
    accountId,
    peerId,
    userId: token.userId,
    messages,
    total: history.count,
    offset,
    limit,
    hasMore: history.items.length === limit,
    markedRead,
  });
}

async function handleMarkAsRead(
  req: IncomingMessage,
  res: ServerResponse,
  peerId: number,
): Promise<void> {
  const body = await readBody(req);
  const accountId = parseAccountId(String(body.accountId ?? ''));
  const token = await getTokenByUserId(accountId);

  const markedRead = await markPeerAsRead(token.accessToken, peerId);

  sendJson(res, 200, { accountId, peerId, markedRead });
}

async function handleSendMessage(
  req: IncomingMessage,
  res: ServerResponse,
  peerId: number,
): Promise<void> {
  const body = await readBody(req);
  const accountId = parseAccountId(String(body.accountId ?? ''));
  const message = String(body.message ?? '').trim();

  if (!message) {
    sendJson(res, 400, { error: 'Message cannot be empty' });
    return;
  }

  const token = await getTokenByUserId(accountId);
  const messageId = await sendMessage(token.accessToken, peerId, message);

  sendJson(res, 200, { messageId, peerId, accountId });
}

function parseSuggestionMessages(value: unknown): ChatMessageForSuggestion[] {
  if (!Array.isArray(value)) {
    throw new Error('messages must be an array');
  }

  const messages = value
    .filter((item): item is ChatMessageForSuggestion => {
      if (typeof item !== 'object' || item == null) return false;
      const candidate = item as Partial<ChatMessageForSuggestion>;
      return (
        typeof candidate.date === 'string'
        && Number.isInteger(candidate.fromId)
        && typeof candidate.text === 'string'
        && Array.isArray(candidate.files)
      );
    })
    .slice(-DEFAULT_MESSAGE_LIMIT);

  if (messages.length === 0) {
    throw new Error('messages cannot be empty');
  }

  return messages;
}

async function handleSuggestReply(
  req: IncomingMessage,
  res: ServerResponse,
  peerId: number,
): Promise<void> {
  const body = await readBody(req);
  const accountId = parseAccountId(String(body.accountId ?? ''));
  const token = await getTokenByUserId(accountId);
  const messages = parseSuggestionMessages(body.messages);
  const suggestion = await suggestReply(messages, token.userId);

  sendJson(res, 200, { accountId, peerId, suggestion });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/accounts') {
      await handleAccounts(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/conversations') {
      await handleConversations(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/pinned-chats') {
      await handleGetPinnedChats(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/pinned-chats/conversations') {
      await handleGetPinnedConversations(req, res);
      return;
    }

    const pinMatch = pathname.match(/^\/api\/chats\/(-?\d+)\/pin$/);
    if (pinMatch && req.method === 'PUT') {
      const peerId = parsePeerId(pinMatch[1]);
      await handleSetChatPin(req, res, peerId);
      return;
    }

    const messagesMatch = pathname.match(/^\/api\/chats\/(-?\d+)\/messages$/);
    if (messagesMatch) {
      const peerId = parsePeerId(messagesMatch[1]);

      if (req.method === 'GET') {
        await handleGetMessages(req, res, peerId);
        return;
      }

      if (req.method === 'POST') {
        await handleSendMessage(req, res, peerId);
        return;
      }
    }

    const suggestReplyMatch = pathname.match(/^\/api\/chats\/(-?\d+)\/suggest-reply$/);
    if (suggestReplyMatch && req.method === 'POST') {
      const peerId = parsePeerId(suggestReplyMatch[1]);
      await handleSuggestReply(req, res, peerId);
      return;
    }

    const readMatch = pathname.match(/^\/api\/chats\/(-?\d+)\/read$/);
    if (readMatch && req.method === 'POST') {
      const peerId = parsePeerId(readMatch[1]);
      await handleMarkAsRead(req, res, peerId);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 400, { error: message });
  }
}

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
