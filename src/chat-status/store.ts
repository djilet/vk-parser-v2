import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ChatStatus, DEFAULT_CHAT_STATUS, isChatStatus } from './types.js';

const STATUS_DIR = join(process.cwd(), 'data', 'chat-status');

type ChatStatusFile = {
  statuses: Record<string, ChatStatus>;
};

function parseStatuses(raw: Record<string, unknown>): Record<number, ChatStatus> {
  const statuses: Record<number, ChatStatus> = {};

  for (const [peerIdKey, status] of Object.entries(raw)) {
    const peerId = Number(peerIdKey);
    if (!Number.isInteger(peerId) || peerId === 0 || !isChatStatus(status)) {
      continue;
    }

    statuses[peerId] = status;
  }

  return statuses;
}

async function readStatusFile(accountId: number): Promise<ChatStatusFile> {
  const filePath = join(STATUS_DIR, `${accountId}.json`);

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as ChatStatusFile;

    if (!parsed.statuses || typeof parsed.statuses !== 'object') {
      return { statuses: {} };
    }

    const statuses: Record<string, ChatStatus> = {};
    for (const [peerIdKey, status] of Object.entries(parsed.statuses)) {
      if (isChatStatus(status)) {
        statuses[peerIdKey] = status;
      }
    }

    return { statuses };
  } catch {
    return { statuses: {} };
  }
}

async function writeStatusFile(accountId: number, statuses: Record<number, ChatStatus>): Promise<void> {
  await mkdir(STATUS_DIR, { recursive: true });
  const filePath = join(STATUS_DIR, `${accountId}.json`);

  const serialized: Record<string, ChatStatus> = {};
  for (const [peerId, status] of Object.entries(statuses)) {
    serialized[String(peerId)] = status;
  }

  await writeFile(filePath, `${JSON.stringify({ statuses: serialized }, null, 2)}\n`, 'utf8');
}

export async function loadChatStatuses(accountId: number): Promise<Record<number, ChatStatus>> {
  const file = await readStatusFile(accountId);
  return parseStatuses(file.statuses);
}

export async function getChatStatus(accountId: number, peerId: number): Promise<ChatStatus> {
  const statuses = await loadChatStatuses(accountId);
  return statuses[peerId] ?? DEFAULT_CHAT_STATUS;
}

export async function setChatStatus(
  accountId: number,
  peerId: number,
  status: ChatStatus,
): Promise<Record<number, ChatStatus>> {
  const current = await loadChatStatuses(accountId);
  const next = { ...current, [peerId]: status };
  await writeStatusFile(accountId, next);
  return next;
}
