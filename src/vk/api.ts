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

export async function getConversations(
  accessToken: string,
  count: number,
  offset = 0,
): Promise<VkGetConversationsResponse> {
  return vkRequest<VkGetConversationsResponse>('messages.getConversations', accessToken, {
    count,
    offset,
    extended: 1,
    fields: 'screen_name',
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

export async function getFullHistory(
  accessToken: string,
  peerId: number,
  options: {
    maxMessages?: number;
    onProgress?: (loaded: number, total: number) => void;
  } = {},
): Promise<VkGetHistoryResponse> {
  const pageSize = 200;
  const allMessages: VkGetHistoryResponse['items'] = [];
  const profiles = new Map<number, NonNullable<VkGetHistoryResponse['profiles']>[number]>();
  const groups = new Map<number, NonNullable<VkGetHistoryResponse['groups']>[number]>();

  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const maxMessages = options.maxMessages;

  while (offset < total) {
    const remaining = maxMessages ? maxMessages - allMessages.length : pageSize;
    if (maxMessages && remaining <= 0) {
      break;
    }

    const page = await getHistory(
      accessToken,
      peerId,
      maxMessages ? Math.min(pageSize, remaining) : pageSize,
      offset,
    );

    total = page.count;
    allMessages.push(...page.items);
    options.onProgress?.(allMessages.length, total);

    for (const profile of page.profiles ?? []) {
      profiles.set(profile.id, profile);
    }

    for (const group of page.groups ?? []) {
      groups.set(group.id, group);
    }

    if (page.items.length === 0) {
      break;
    }

    offset += page.items.length;

    if (offset < total && (!maxMessages || allMessages.length < maxMessages)) {
      await sleep(400);
    }
  }

  allMessages.sort((a, b) => a.date - b.date || a.id - b.id);

  return {
    count: allMessages.length,
    items: allMessages,
    profiles: [...profiles.values()],
    groups: [...groups.values()],
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
