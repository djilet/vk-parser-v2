import type { VkApiErrorResponse, VkGetConversationsResponse, VkGetHistoryResponse } from './types.js';

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
): Promise<VkGetHistoryResponse> {
  return vkRequest<VkGetHistoryResponse>('messages.getHistory', accessToken, {
    peer_id: peerId,
    count,
    offset,
    extended: 1,
    rev: 0,
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
