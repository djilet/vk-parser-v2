import { isTokenExpired, loadAllTokens, type SavedToken } from '../src/token/index.js';
import { getConversationsById, getLongPollServer, getUsers, type LongPollServer } from '../src/vk/api.js';
import { mapConversationToSummary, type ChatSummaryData } from '../src/vk/conversation-summary.js';
import { enrichConversationItemWithLastMessage } from '../src/vk/enrich-conversations.js';
import type { ParsedNewMessage } from '../src/vk/long-poll.js';
import { formatMessage } from '../src/vk/message-format.js';
import {
  isLongPollFailed,
  parseNewMessageUpdate,
  parseReadUpdate,
  parseUnreadCountUpdate,
  pollLongPoll,
  resolveMessageFromId,
  waitBeforeLongPollRetry,
} from '../src/vk/long-poll.js';
import { eventBus } from './event-bus.js';

const ACCOUNT_SYNC_MS = 60_000;

type AccountWorker = {
  accountId: number;
  userId: number;
  accessToken: string;
  abortController: AbortController;
  loopPromise: Promise<void>;
};

const workers = new Map<number, AccountWorker>();

function isActiveToken(token: SavedToken): token is SavedToken & { userId: number } {
  return token.userId != null && !isTokenExpired(token);
}

function lastMessageFromLongPoll(parsed: ParsedNewMessage): ChatSummaryData['lastMessage'] {
  return {
    text: parsed.text,
    date: new Date(parsed.timestamp * 1000).toISOString(),
    out: parsed.outgoing,
  };
}

function mergeChatSummary(chat: ChatSummaryData, lastMessage: ChatSummaryData['lastMessage']): ChatSummaryData {
  if (lastMessage == null) {
    return chat;
  }

  const apiMessage = chat.lastMessage;
  const apiTimestamp = apiMessage ? Date.parse(apiMessage.date) : 0;
  const incomingTimestamp = Date.parse(lastMessage.date);

  if (apiMessage == null || incomingTimestamp >= apiTimestamp) {
    return {
      ...chat,
      lastMessage: {
        text: lastMessage.text || apiMessage?.text || '',
        date: lastMessage.date,
        out: lastMessage.out,
      },
    };
  }

  return chat;
}

async function buildFallbackChatSummary(
  accessToken: string,
  parsed: ParsedNewMessage,
  lastMessage: ChatSummaryData['lastMessage'],
): Promise<ChatSummaryData> {
  const peerId = parsed.peerId;
  let peerType = 'user';
  let title = `peer_${peerId}`;
  let photoUrl: string | undefined;

  if (peerId >= 2000000000) {
    peerType = 'chat';
    title = `Беседа #${peerId - 2_000_000_000}`;
  } else if (peerId < 0) {
    peerType = 'group';
    title = `Сообщество ${Math.abs(peerId)}`;
  } else {
    try {
      const profiles = await getUsers(accessToken, [peerId]);
      const profile = profiles?.[0];
      if (profile) {
        title = `${profile.first_name} ${profile.last_name}`.trim();
        photoUrl = typeof profile.photo_100 === 'string' ? profile.photo_100 : undefined;
      }
    } catch {
      // keep generic title
    }
  }

  return mergeChatSummary(
    {
      peerId,
      peerType,
      title,
      photoUrl,
      unreadCount: parsed.outgoing ? 0 : 1,
      lastMessage: null,
    },
    lastMessage,
  );
}

async function refreshPeerConversation(
  accountId: number,
  accessToken: string,
  peerId: number,
): Promise<void> {
  const data = await getConversationsById(accessToken, [peerId]);
  const item = data.items[0];

  if (!item) {
    return;
  }

  const enrichedItem = await enrichConversationItemWithLastMessage(accessToken, item);
  const chat = mapConversationToSummary(enrichedItem, data.profiles ?? [], data.groups ?? []);
  eventBus.emit({ type: 'chat.updated', accountId, chat });
}

async function handleNewMessage(
  accountId: number,
  accountUserId: number,
  accessToken: string,
  update: unknown[],
): Promise<void> {
  const parsed = parseNewMessageUpdate(update);
  if (!parsed) {
    return;
  }

  const longPollLastMessage = lastMessageFromLongPoll(parsed);
  let formattedMessage: ReturnType<typeof formatMessage> | null = null;

  try {
    const data = await getConversationsById(accessToken, [parsed.peerId]);
    const item = data.items[0];

    if (item) {
      const enrichedItem = await enrichConversationItemWithLastMessage(accessToken, item);
      const chat = mergeChatSummary(
        mapConversationToSummary(enrichedItem, data.profiles ?? [], data.groups ?? []),
        longPollLastMessage,
      );
      eventBus.emit({ type: 'chat.updated', accountId, chat });

      const lastMessage = enrichedItem.last_message;
      if (lastMessage && lastMessage.id === parsed.messageId) {
        formattedMessage = formatMessage(lastMessage);
      }
    } else {
      const chat = await buildFallbackChatSummary(accessToken, parsed, longPollLastMessage);
      eventBus.emit({ type: 'chat.updated', accountId, chat });
    }
  } catch {
    const chat = await buildFallbackChatSummary(accessToken, parsed, longPollLastMessage);
    eventBus.emit({ type: 'chat.updated', accountId, chat });
  }

  eventBus.emit({
    type: 'message.new',
    accountId,
    peerId: parsed.peerId,
    message:
      formattedMessage ?? {
        id: parsed.messageId,
        date: longPollLastMessage.date,
        fromId: resolveMessageFromId(parsed.peerId, parsed.outgoing, accountUserId, update[6]),
        text: parsed.text,
        files: [],
      },
  });
}

async function handleUpdate(
  accountId: number,
  accountUserId: number,
  accessToken: string,
  update: unknown,
): Promise<void> {
  if (!Array.isArray(update)) {
    return;
  }

  const unreadCount = parseUnreadCountUpdate(update);
  if (unreadCount != null) {
    eventBus.emit({ type: 'unread_count', accountId, count: unreadCount });
    return;
  }

  const readEvent = parseReadUpdate(update);
  if (readEvent) {
    eventBus.emit({
      type: 'messages.read',
      accountId,
      peerId: readEvent.peerId,
      incoming: readEvent.incoming,
    });

    try {
      await refreshPeerConversation(accountId, accessToken, readEvent.peerId);
    } catch {
      // keep read event even if refresh fails
    }
    return;
  }

  if (update[0] === 4) {
    await handleNewMessage(accountId, accountUserId, accessToken, update);
    return;
  }

  if (update[0] === 5) {
    const peerId = Number(update[3]);
    if (Number.isInteger(peerId)) {
      try {
        await refreshPeerConversation(accountId, accessToken, peerId);
      } catch {
        // ignore refresh failures for edits
      }
    }
  }
}

async function runLongPollLoop(
  accountId: number,
  accountUserId: number,
  accessToken: string,
  signal: AbortSignal,
): Promise<void> {
  let credentials: LongPollServer = await getLongPollServer(accessToken);
  let errorAttempt = 0;

  while (!signal.aborted) {
    try {
      const response = await pollLongPoll(credentials.server, credentials.key, credentials.ts);

      if (isLongPollFailed(response)) {
        if (response.failed === 1) {
          credentials = { ...credentials, ts: response.ts };
          continue;
        }

        credentials = await getLongPollServer(accessToken);
        errorAttempt = 0;
        continue;
      }

      credentials = {
        ...credentials,
        ts: response.ts,
        pts: response.pts ?? credentials.pts,
      };
      errorAttempt = 0;

      for (const update of response.updates ?? []) {
        if (signal.aborted) {
          return;
        }

        await handleUpdate(accountId, accountUserId, accessToken, update);
      }
    } catch {
      if (signal.aborted) {
        return;
      }

      await waitBeforeLongPollRetry(errorAttempt);
      errorAttempt += 1;

      try {
        credentials = await getLongPollServer(accessToken);
      } catch {
        // keep retrying with existing credentials
      }
    }
  }
}

function startWorker(token: SavedToken & { userId: number }): void {
  if (workers.has(token.userId)) {
    return;
  }

  const abortController = new AbortController();
  const loopPromise = runLongPollLoop(
    token.userId,
    token.userId,
    token.accessToken,
    abortController.signal,
  ).finally(() => {
    workers.delete(token.userId!);
  });

  workers.set(token.userId, {
    accountId: token.userId,
    userId: token.userId,
    accessToken: token.accessToken,
    abortController,
    loopPromise,
  });

  console.log(`Long Poll started for account ${token.userId}`);
}

function stopWorker(accountId: number): void {
  const worker = workers.get(accountId);
  if (!worker) {
    return;
  }

  worker.abortController.abort();
  workers.delete(accountId);
  console.log(`Long Poll stopped for account ${accountId}`);
}

async function syncAccounts(): Promise<void> {
  const tokens = await loadAllTokens();
  const activeAccountIds = new Set<number>();

  for (const token of tokens) {
    if (!isActiveToken(token)) {
      continue;
    }

    activeAccountIds.add(token.userId);
    const existing = workers.get(token.userId);

    if (existing && existing.accessToken !== token.accessToken) {
      stopWorker(token.userId);
    }

    if (!workers.has(token.userId)) {
      startWorker(token);
    }
  }

  for (const accountId of workers.keys()) {
    if (!activeAccountIds.has(accountId)) {
      stopWorker(accountId);
    }
  }
}

export function startLongPollManager(): void {
  void syncAccounts();
  setInterval(() => {
    void syncAccounts();
  }, ACCOUNT_SYNC_MS);
}

export function stopLongPollManager(): void {
  for (const accountId of [...workers.keys()]) {
    stopWorker(accountId);
  }
}
