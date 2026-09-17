import {
  createVkClient,
  isLongPollFailed,
  isTokenExpired,
  loadAllTokens,
  parseNewMessageUpdate,
  parseReadUpdate,
  parseUnreadCountUpdate,
  pollLongPoll,
  resolveMessageFromId,
  waitBeforeLongPollRetry,
  type EnvConfig,
  type LongPollServer,
  type ParsedNewMessage,
  type SavedToken,
  type VkClient,
} from '@vk-sales-bot/core';
import { enrichConversationItemWithLastMessage, formatMessage, mapConversationToSummary, type ChatSummaryData } from '@vk-sales-bot/chat';
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
let vkEnv: Pick<EnvConfig, 'vk'> | null = null;

function isActiveToken(token: SavedToken): token is SavedToken & { userId: number } {
  return token.userId != null && !isTokenExpired(token);
}

function lastMessageFromLongPoll(parsed: ParsedNewMessage): NonNullable<ChatSummaryData['lastMessage']> {
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
  vk: VkClient,
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
      const profiles = await vk.getUsers([peerId]);
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
    { peerId, peerType, title, photoUrl, unreadCount: parsed.outgoing ? 0 : 1, lastMessage: null },
    lastMessage,
  );
}

async function refreshPeerConversation(accountId: number, vk: VkClient, peerId: number): Promise<void> {
  const data = await vk.getConversationsById([peerId]);
  const item = data.items[0];

  if (!item) {
    return;
  }

  const enrichedItem = await enrichConversationItemWithLastMessage(vk, item);
  const chat = mapConversationToSummary(enrichedItem, data.profiles ?? [], data.groups ?? []);
  eventBus.emit({ type: 'chat.updated', accountId, chat });
}

async function handleNewMessage(
  accountId: number,
  accountUserId: number,
  vk: VkClient,
  update: unknown[],
): Promise<void> {
  const parsed = parseNewMessageUpdate(update);
  if (!parsed) {
    return;
  }

  const longPollLastMessage = lastMessageFromLongPoll(parsed);
  let formattedMessage: ReturnType<typeof formatMessage> | null = null;

  try {
    const data = await vk.getConversationsById([parsed.peerId]);
    const item = data.items[0];

    if (item) {
      const enrichedItem = await enrichConversationItemWithLastMessage(vk, item);
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
      const chat = await buildFallbackChatSummary(vk, parsed, longPollLastMessage);
      eventBus.emit({ type: 'chat.updated', accountId, chat });
    }
  } catch {
    const chat = await buildFallbackChatSummary(vk, parsed, longPollLastMessage);
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

async function handleUpdate(accountId: number, accountUserId: number, vk: VkClient, update: unknown): Promise<void> {
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
    eventBus.emit({ type: 'messages.read', accountId, peerId: readEvent.peerId, incoming: readEvent.incoming });

    try {
      await refreshPeerConversation(accountId, vk, readEvent.peerId);
    } catch {
      // keep read event even if refresh fails
    }
    return;
  }

  if (update[0] === 4) {
    await handleNewMessage(accountId, accountUserId, vk, update);
    return;
  }

  if (update[0] === 5) {
    const peerId = Number(update[3]);
    if (Number.isInteger(peerId)) {
      try {
        await refreshPeerConversation(accountId, vk, peerId);
      } catch {
        // ignore refresh failures for edits
      }
    }
  }
}

async function runLongPollLoop(
  accountId: number,
  accountUserId: number,
  vk: VkClient,
  signal: AbortSignal,
): Promise<void> {
  let credentials: LongPollServer | null = null;
  let errorAttempt = 0;

  while (!signal.aborted) {
    try {
      // Only fetch a NEW long-poll server when we don't have one yet, or VK told us to
      // (failed:2 key expired, failed:3 history lost/ts too old). The original code called
      // getLongPollServer() at the top of every iteration unconditionally, which threw away
      // the `ts` cursor this same loop had just advanced at the bottom of the previous
      // iteration — every poll effectively restarted from VK's *current* ts, silently
      // dropping any update that arrived between the poll returning and the re-fetch, plus
      // burning an extra API call every ~25s per account.
      credentials ??= await vk.getLongPollServer();

      const response = await pollLongPoll(credentials.server, credentials.key, credentials.ts);

      if (isLongPollFailed(response)) {
        if (response.failed === 1) {
          credentials = { ...credentials, ts: response.ts };
          continue;
        }

        // failed: 2 (key expired), 3 (history lost/ts too old), 4 (version mismatch) — only
        // these actually require a fresh server+key.
        credentials = await vk.getLongPollServer();
        errorAttempt = 0;
        continue;
      }

      credentials = { ...credentials, ts: response.ts, pts: response.pts ?? credentials.pts };
      errorAttempt = 0;

      for (const update of response.updates ?? []) {
        if (signal.aborted) {
          return;
        }

        await handleUpdate(accountId, accountUserId, vk, update);
      }
    } catch {
      if (signal.aborted) {
        return;
      }

      await waitBeforeLongPollRetry(errorAttempt);
      errorAttempt += 1;

      try {
        credentials = await vk.getLongPollServer();
      } catch {
        // keep retrying with existing credentials
      }
    }
  }
}

function startWorker(token: SavedToken & { userId: number }, env: Pick<EnvConfig, 'vk'>): void {
  if (workers.has(token.userId)) {
    return;
  }

  const vk = createVkClient(token.accessToken, {
    requestTimeoutMs: env.vk.requestTimeoutMs,
    requestDelayMs: env.vk.requestDelayMs,
  });

  const abortController = new AbortController();
  const loopPromise = runLongPollLoop(token.userId, token.userId, vk, abortController.signal)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Long Poll failed for account ${token.userId}: ${message}`);
    })
    .finally(() => {
      workers.delete(token.userId);
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

export function stopAccountLongPoll(accountId: number): void {
  const worker = workers.get(accountId);
  if (!worker) {
    return;
  }

  worker.abortController.abort();
  workers.delete(accountId);
  console.log(`Long Poll stopped for account ${accountId}`);
}

async function syncAccounts(env: Pick<EnvConfig, 'vk'>): Promise<void> {
  const tokens = await loadAllTokens();
  const activeAccountIds = new Set<number>();

  for (const token of tokens) {
    if (!isActiveToken(token)) {
      continue;
    }

    activeAccountIds.add(token.userId);
    const existing = workers.get(token.userId);

    if (existing && existing.accessToken !== token.accessToken) {
      stopAccountLongPoll(token.userId);
    }

    if (!workers.has(token.userId)) {
      startWorker(token, env);
    }
  }

  for (const accountId of workers.keys()) {
    if (!activeAccountIds.has(accountId)) {
      stopAccountLongPoll(accountId);
    }
  }
}

export function syncLongPollAccounts(): void {
  if (!vkEnv) return;
  void syncAccounts(vkEnv);
}

export function startLongPollManager(env: Pick<EnvConfig, 'vk'>): void {
  vkEnv = env;
  void syncAccounts(env);
  setInterval(() => {
    void syncAccounts(env);
  }, ACCOUNT_SYNC_MS);
}

export function stopLongPollManager(): void {
  for (const accountId of [...workers.keys()]) {
    stopAccountLongPoll(accountId);
  }
}
