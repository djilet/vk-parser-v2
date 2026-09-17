import { sleep } from './client.js';
import type { LongPollServer } from './client.js';

export type { LongPollServer };

export type LongPollSuccessResponse = {
  ts: number;
  updates: unknown[][];
  pts?: number;
};

export type LongPollFailedResponse =
  | { failed: 1; ts: number }
  | { failed: 2 }
  | { failed: 3 }
  | { failed: 4; min_version: number; max_version: number };

export type LongPollResponse = LongPollSuccessResponse | LongPollFailedResponse;

const LONG_POLL_MODE = 2 + 8 + 32 + 128;
const LONG_POLL_WAIT_SECONDS = 25;

export async function pollLongPoll(server: string, key: string, ts: number): Promise<LongPollResponse> {
  const baseUrl = server.startsWith('http') ? server : `https://${server}`;
  const url = new URL(baseUrl);

  url.searchParams.set('act', 'a_check');
  url.searchParams.set('key', key);
  url.searchParams.set('ts', String(ts));
  url.searchParams.set('wait', String(LONG_POLL_WAIT_SECONDS));
  url.searchParams.set('mode', String(LONG_POLL_MODE));
  url.searchParams.set('version', '3');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Long Poll HTTP ${response.status}`);
  }

  return (await response.json()) as LongPollResponse;
}

export function isLongPollFailed(response: LongPollResponse): response is LongPollFailedResponse {
  return 'failed' in response;
}

export type ParsedNewMessage = {
  messageId: number;
  peerId: number;
  flags: number;
  timestamp: number;
  text: string;
  outgoing: boolean;
};

export function parseNewMessageUpdate(update: unknown[]): ParsedNewMessage | null {
  if (update[0] !== 4) {
    return null;
  }

  const messageId = Number(update[1]);
  const flags = Number(update[2]);
  const peerId = Number(update[3]);
  const timestamp = Number(update[4]);
  const text = typeof update[5] === 'string' ? update[5] : '';

  if (!Number.isInteger(messageId) || !Number.isInteger(peerId) || !Number.isInteger(timestamp)) {
    return null;
  }

  return {
    messageId,
    peerId,
    flags,
    timestamp,
    text,
    outgoing: (flags & 2) !== 0,
  };
}

export function parseUnreadCountUpdate(update: unknown[]): number | null {
  if (update[0] !== 80) {
    return null;
  }

  const count = Number(update[1]);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

export function parseReadUpdate(update: unknown[]): { peerId: number; incoming: boolean } | null {
  const code = update[0];

  if (code !== 6 && code !== 7) {
    return null;
  }

  const peerId = Number(update[1]);
  if (!Number.isInteger(peerId)) {
    return null;
  }

  return { peerId, incoming: code === 6 };
}

export function resolveMessageFromId(
  peerId: number,
  outgoing: boolean,
  accountUserId: number,
  extra?: unknown,
): number {
  if (outgoing) {
    return accountUserId;
  }

  const record = extra && typeof extra === 'object' ? (extra as Record<string, unknown>) : null;
  const from = record?.from;

  if (typeof from === 'string' && from.length > 0) {
    const fromId = Number(from);
    if (Number.isInteger(fromId)) {
      return fromId;
    }
  }

  if (peerId >= 2000000000 || peerId < 0) {
    return accountUserId;
  }

  return peerId;
}

export async function waitBeforeLongPollRetry(attempt: number): Promise<void> {
  const waitMs = Math.min(1000 * 2 ** attempt, 30_000);
  await sleep(waitMs);
}
