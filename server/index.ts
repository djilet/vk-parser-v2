import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { getTokenByUserId, isTokenExpired, loadAllTokens } from '../src/token/index.js';
import { getConversations, getFullHistory, sendMessage } from '../src/vk/api.js';
import { formatMessages } from '../src/vk/message-format.js';
import { resolvePeerTitle } from '../src/vk/peer-title.js';

const PORT = Number(process.env.PORT ?? 3001);
const CHAT_LIMIT = 60;
const MAX_MESSAGES = 200;

type JsonBody = Record<string, unknown>;

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

async function handleAccounts(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const tokens = await loadAllTokens();

  sendJson(
    res,
    200,
    tokens.map((token) => ({
      userId: token.userId,
      email: token.email,
      browserId: token.browserId,
      expired: isTokenExpired(token),
    })),
  );
}

async function handleConversations(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const accountId = parseAccountId(url.searchParams.get('accountId'));
  const token = await getTokenByUserId(accountId);

  const data = await getConversations(token.accessToken, CHAT_LIMIT);
  const profiles = data.profiles ?? [];
  const groups = data.groups ?? [];

  const chats = data.items.map((item) => {
    const lastMessage = item.last_message;
    const peerId = item.conversation.peer.id;

    return {
      peerId,
      peerType: item.conversation.peer.type,
      title: resolvePeerTitle(item, profiles, groups),
      unreadCount: item.conversation.unread_count,
      lastMessage: lastMessage
        ? {
            text: lastMessage.text ?? '',
            date: new Date(lastMessage.date * 1000).toISOString(),
            out: lastMessage.out === 1,
          }
        : null,
    };
  });

  sendJson(res, 200, { accountId, chats });
}

async function handleGetMessages(
  req: IncomingMessage,
  res: ServerResponse,
  peerId: number,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const accountId = parseAccountId(url.searchParams.get('accountId'));
  const token = await getTokenByUserId(accountId);

  const history = await getFullHistory(token.accessToken, peerId, { maxMessages: MAX_MESSAGES });
  const messages = formatMessages(history.items);

  sendJson(res, 200, {
    accountId,
    peerId,
    userId: token.userId,
    messages,
  });
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

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, null);
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
