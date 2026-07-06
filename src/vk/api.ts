import type { VkApiErrorResponse, VkConversation, VkConversationItem, VkGetConversationsResponse, VkGetHistoryResponse } from './types.js';

export const VK_API_VERSION = '5.199';

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

const FLOOD_CONTROL_CODE = 9;
const AUTH_FAILED_CODE = 5;
const MAX_RETRIES = 5;

async function vkRequest<T>(method: string, accessToken: string, params: VkParams): Promise<T> {
  let attempt = 0;

  while (true) {
    const url = new URL(`https://api.vk.com/method/${method}`);

    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('v', VK_API_VERSION);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url);
    const payload = (await response.json()) as { response: T } | VkApiErrorResponse;

    if (payload && typeof payload === 'object' && 'error' in payload) {
      const error = payload.error;

      if (error.error_code === FLOOD_CONTROL_CODE && attempt < MAX_RETRIES) {
        const waitMs = 1000 * 2 ** attempt;
        await sleep(waitMs);
        attempt += 1;
        continue;
      }

      throw new VkApiError(method, error.error_code, error.error_msg);
    }

    return payload.response;
  }
}

export type VkConversationFilter = 'all' | 'unread' | 'important' | 'unanswered';

export async function getConversations(
  accessToken: string,
  count: number,
  offset = 0,
  filter: VkConversationFilter = 'all',
): Promise<VkGetConversationsResponse> {
  return vkRequest<VkGetConversationsResponse>('messages.getConversations', accessToken, {
    count,
    offset,
    extended: 1,
    fields: 'photo_100,screen_name',
    filter,
  });
}

export async function getConversationsById(
  accessToken: string,
  peerIds: number[],
): Promise<VkGetConversationsResponse> {
  if (peerIds.length === 0) {
    return { count: 0, items: [] };
  }

  return vkRequest<VkGetConversationsResponse>('messages.getConversationsById', accessToken, {
    peer_ids: peerIds.join(','),
    extended: 1,
    fields: 'photo_100,screen_name',
  });
}

export async function getHistory(
  accessToken: string,
  peerId: number,
  count: number,
  offset: number,
  startCmid?: number,
): Promise<VkGetHistoryResponse> {
  return vkRequest<VkGetHistoryResponse>('messages.getHistory', accessToken, {
    peer_id: peerId,
    count,
    offset,
    extended: 1,
    rev: 0,
    start_cmid: startCmid,
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getUsers(accessToken: string, userIds: number[]): Promise<VkGetHistoryResponse['profiles']> {
  if (userIds.length === 0) {
    return [];
  }

  return vkRequest<NonNullable<VkGetHistoryResponse['profiles']>>('users.get', accessToken, {
    user_ids: userIds.join(','),
  });
}

export async function isAccessTokenValid(accessToken: string, userId: number): Promise<boolean> {
  try {
    await getUsers(accessToken, [userId]);
    return true;
  } catch (error) {
    if (error instanceof VkApiError && error.code === AUTH_FAILED_CODE) {
      return false;
    }

    return true;
  }
}

export async function sendMessage(
  accessToken: string,
  peerId: number,
  message: string,
): Promise<number> {
  return vkRequest<number>('messages.send', accessToken, {
    peer_id: peerId,
    message,
    random_id: Math.floor(Math.random() * 2_147_483_647),
  });
}

export async function markAsRead(accessToken: string, peerId: number, upToCmid?: number): Promise<1> {
  return vkRequest<1>('messages.markAsRead', accessToken, {
    peer_id: peerId,
    up_to_cmid: upToCmid,
    mark_conversation_as_read: upToCmid == null ? 1 : undefined,
  });
}

function normalizeConversation(item: VkConversationItem | VkConversation): VkConversation {
  if ('conversation' in item) {
    return item.conversation;
  }

  return item;
}

export async function markPeerAsRead(accessToken: string, peerId: number): Promise<boolean> {
  const data = await getConversationsById(accessToken, [peerId]);
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
    const history = await getHistory(accessToken, peerId, 1, 0);

    if (history.items.length > 0) {
      upToCmid = Math.max(...history.items.map((message) => message.conversation_message_id));
    }
  }

  await markAsRead(accessToken, peerId, upToCmid);
  return true;
}

export type LongPollServer = {
  server: string;
  key: string;
  ts: number;
  pts?: number;
};

export async function getLongPollServer(accessToken: string): Promise<LongPollServer> {
  return vkRequest<LongPollServer>('messages.getLongPollServer', accessToken, {
    need_pts: 1,
    lp_version: 3,
  });
}
