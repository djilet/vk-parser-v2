import type {
  VkApiErrorResponse,
  VkConversation,
  VkConversationItem,
  VkGetConversationsResponse,
  VkGetHistoryResponse,
  VkProfile,
} from './types.js';

/** Версия VK API — фиксируем, чтобы ответ не менялся при обновлениях на стороне VK. */
export const VK_API_VERSION = '5.199';

/** Истёкший/невалидный токен — вызывающий код должен прервать весь прогон. */
export const AUTH_FAILED_CODE = 5;
const TOO_MANY_REQUESTS_CODE = 6;
const FLOOD_CONTROL_CODE = 9;
const DEFAULT_MAX_RETRIES = 5;

type VkParams = Record<string, string | number | boolean | undefined>;

export class VkApiError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    message: string,
  ) {
    super(`VK API ${method}: ${message} (${code})`);
    this.name = 'VkApiError';
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type VkClientOptions = {
  requestTimeoutMs: number;
  requestDelayMs: number;
  maxRetries?: number;
};

export type VkConversationFilter = 'all' | 'unread' | 'important' | 'unanswered';

export type LongPollServer = {
  server: string;
  key: string;
  ts: number;
  pts?: number;
};

export type VkClient = {
  getHistory(
    peerId: number,
    count: number,
    offset: number,
    options?: { startCmid?: number; extended?: boolean },
  ): Promise<VkGetHistoryResponse>;
  getConversations(
    count: number,
    offset?: number,
    filter?: VkConversationFilter,
    options?: { extended?: boolean },
  ): Promise<VkGetConversationsResponse>;
  getConversationsById(peerIds: number[]): Promise<VkGetConversationsResponse>;
  getUsers(userIds: number[], fields?: string): Promise<VkProfile[]>;
  sendMessage(peerId: number, message: string): Promise<number>;
  markAsRead(peerId: number, upToCmid?: number): Promise<1>;
  markPeerAsRead(peerId: number): Promise<boolean>;
  getLongPollServer(): Promise<LongPollServer>;
  isAccessTokenValid(userId: number): Promise<boolean>;
};

function normalizeConversation(item: VkConversationItem | VkConversation): VkConversation {
  return 'conversation' in item ? item.conversation : item;
}

/**
 * One client per access token. VK rate limits are per token, so serializing every account
 * through a single global queue (as vk-parser-v2's src/vk/api.js originally did) would
 * needlessly slow one account down while another sits idle.
 */
export function createVkClient(accessToken: string, options: VkClientOptions): VkClient {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  /**
   * Запросы к VK сериализуем через одну очередь с паузой между ними: user-токен ограничен
   * тремя запросами в секунду, а без сериализации параллельные вызовы (Promise.all) быстро
   * ловят flood control.
   */
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn, fn);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function rawRequest<T>(
    method: string,
    params: VkParams,
  ): Promise<{ response: T } | VkApiErrorResponse> {
    const url = new URL(`https://api.vk.com/method/${method}`);
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('v', VK_API_VERSION);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(options.requestTimeoutMs) });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new Error(`VK API: ${method} — нет ответа за ${options.requestTimeoutMs} мс`);
      }
      throw new Error(
        `VK API: ${method} — сетевая ошибка: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return response.json() as Promise<{ response: T } | VkApiErrorResponse>;
  }

  async function vkRequest<T>(method: string, params: VkParams): Promise<T> {
    return enqueue(async () => {
      let attempt = 0;

      // Пауза после каждого вызова случается независимо от исхода (успех/финальная ошибка
      // после исчерпанных ретраев) — иначе запрос сразу после упавшего уходит вплотную к
      // нему, ровно когда пауза нужнее всего.
      try {
        for (;;) {
          const payload = await rawRequest<T>(method, params);

          if (payload && typeof payload === 'object' && 'error' in payload) {
            const { error } = payload;
            const isRetryable =
              error.error_code === FLOOD_CONTROL_CODE || error.error_code === TOO_MANY_REQUESTS_CODE;

            if (isRetryable && attempt < maxRetries) {
              await sleep(1000 * 2 ** attempt);
              attempt += 1;
              continue;
            }

            throw new VkApiError(method, error.error_code, error.error_msg);
          }

          return payload.response;
        }
      } finally {
        await sleep(options.requestDelayMs);
      }
    });
  }

  const getHistory: VkClient['getHistory'] = (peerId, count, offset, historyOptions = {}) =>
    vkRequest('messages.getHistory', {
      peer_id: peerId,
      count,
      offset,
      extended: historyOptions.extended === false ? 0 : 1,
      rev: 0,
      start_cmid: historyOptions.startCmid,
    });

  const getConversations: VkClient['getConversations'] = (
    count,
    offset = 0,
    filter = 'all',
    conversationOptions = {},
  ) =>
    vkRequest('messages.getConversations', {
      count,
      offset,
      filter,
      extended: conversationOptions.extended === false ? 0 : 1,
      fields: 'photo_100,screen_name',
    });

  const getConversationsById: VkClient['getConversationsById'] = (peerIds) => {
    if (peerIds.length === 0) {
      return Promise.resolve({ count: 0, items: [] });
    }

    return vkRequest('messages.getConversationsById', {
      peer_ids: peerIds.join(','),
      extended: 1,
      fields: 'photo_100,screen_name',
    });
  };

  const getUsers: VkClient['getUsers'] = (userIds, fields) => {
    if (userIds.length === 0) {
      return Promise.resolve([]);
    }

    return vkRequest('users.get', { user_ids: userIds.join(','), fields });
  };

  const sendMessage: VkClient['sendMessage'] = (peerId, message) =>
    vkRequest('messages.send', {
      peer_id: peerId,
      message,
      random_id: Math.floor(Math.random() * 2_147_483_647),
    });

  const markAsRead: VkClient['markAsRead'] = (peerId, upToCmid) =>
    vkRequest('messages.markAsRead', {
      peer_id: peerId,
      up_to_cmid: upToCmid,
      mark_conversation_as_read: upToCmid == null ? 1 : undefined,
    });

  const markPeerAsRead: VkClient['markPeerAsRead'] = async (peerId) => {
    const data = await getConversationsById([peerId]);
    const item = data.items[0];
    if (!item) {
      return false;
    }

    const conversation = normalizeConversation(item);
    if ((conversation.unread_count ?? 0) === 0) {
      return false;
    }

    let upToCmid = conversation.last_conversation_message_id;
    if (upToCmid == null) {
      const history = await getHistory(peerId, 1, 0);
      if (history.items.length > 0) {
        upToCmid = Math.max(...history.items.map((message) => message.conversation_message_id));
      }
    }

    await markAsRead(peerId, upToCmid);
    return true;
  };

  const getLongPollServer: VkClient['getLongPollServer'] = () =>
    vkRequest('messages.getLongPollServer', { need_pts: 1, lp_version: 3 });

  const isAccessTokenValid: VkClient['isAccessTokenValid'] = async (userId) => {
    try {
      await getUsers([userId]);
      return true;
    } catch (error) {
      if (error instanceof VkApiError && error.code === AUTH_FAILED_CODE) {
        return false;
      }
      return true;
    }
  };

  return {
    getHistory,
    getConversations,
    getConversationsById,
    getUsers,
    sendMessage,
    markAsRead,
    markPeerAsRead,
    getLongPollServer,
    isAccessTokenValid,
  };
}
