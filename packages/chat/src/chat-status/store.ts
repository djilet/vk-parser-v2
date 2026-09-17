import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dataPath } from '@vk-sales-bot/core';
import { ChatStatus, isChatStatus } from './types.js';

function statusFilePath(accountId: number): string {
  return dataPath('chat-status', `${accountId}.json`);
}

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
  try {
    const raw = await readFile(statusFilePath(accountId), 'utf8');
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
  const filePath = statusFilePath(accountId);
  await mkdir(dataPath('chat-status'), { recursive: true });

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

export async function loadPeerIdsByStatus(accountId: number, status: ChatStatus): Promise<number[]> {
  const statuses = await loadChatStatuses(accountId);

  return Object.entries(statuses)
    .filter(([, entryStatus]) => entryStatus === status)
    .map(([peerIdKey]) => Number(peerIdKey))
    .filter((peerId) => Number.isInteger(peerId) && peerId !== 0);
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
