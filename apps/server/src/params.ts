import type { VkConversationFilter } from '@vk-sales-bot/core';
import { isChatStatus, type ChatStatus } from '@vk-sales-bot/contracts';
import { badRequest } from './errors.js';

export const DEFAULT_CHAT_LIMIT = 20;
export const MAX_CHAT_LIMIT = 200;
export const DEFAULT_MESSAGE_LIMIT = 50;
export const MAX_MESSAGE_LIMIT = 200;

export function parseAccountId(value: string | null): number {
  const accountId = Number(value);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw badRequest('accountId must be a positive integer');
  }

  return accountId;
}

export function parsePeerId(value: string): number {
  const peerId = Number(value);

  if (!Number.isInteger(peerId) || peerId === 0) {
    throw badRequest('peerId must be a non-zero integer');
  }

  return peerId;
}

export function parseLimit(value: string | null, defaultLimit = DEFAULT_CHAT_LIMIT, maxLimit = MAX_CHAT_LIMIT): number {
  const limit = value ? Number(value) : defaultLimit;

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw badRequest(`limit must be an integer between 1 and ${maxLimit}`);
  }

  return limit;
}

export function parseOffset(value: string | null): number {
  const offset = value ? Number(value) : 0;

  if (!Number.isInteger(offset) || offset < 0) {
    throw badRequest('offset must be a non-negative integer');
  }

  return offset;
}

export function parseConversationFilter(value: string | null): VkConversationFilter {
  const filter = value ?? 'all';

  if (filter !== 'all' && filter !== 'unread' && filter !== 'important' && filter !== 'unanswered') {
    throw badRequest('filter must be all, unread, important, or unanswered');
  }

  return filter;
}

export function parseChatStatus(value: unknown): ChatStatus {
  if (!isChatStatus(value)) {
    throw badRequest('Invalid chat status');
  }

  return value;
}
