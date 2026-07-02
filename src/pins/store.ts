import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PINS_DIR = join(process.cwd(), 'data', 'pinned-chats');

type PinnedChatsFile = {
  peerIds: number[];
};

async function readPinnedFile(accountId: number): Promise<PinnedChatsFile> {
  const filePath = join(PINS_DIR, `${accountId}.json`);

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as PinnedChatsFile;

    if (!Array.isArray(parsed.peerIds)) {
      return { peerIds: [] };
    }

    return {
      peerIds: parsed.peerIds.filter((peerId) => Number.isInteger(peerId) && peerId !== 0),
    };
  } catch {
    return { peerIds: [] };
  }
}

async function writePinnedFile(accountId: number, peerIds: number[]): Promise<void> {
  await mkdir(PINS_DIR, { recursive: true });
  const filePath = join(PINS_DIR, `${accountId}.json`);
  await writeFile(filePath, `${JSON.stringify({ peerIds }, null, 2)}\n`, 'utf8');
}

export async function loadPinnedPeerIds(accountId: number): Promise<number[]> {
  const file = await readPinnedFile(accountId);
  return file.peerIds;
}

export async function savePinnedPeerIds(accountId: number, peerIds: number[]): Promise<number[]> {
  const unique: number[] = [];

  for (const peerId of peerIds) {
    if (!unique.includes(peerId)) {
      unique.push(peerId);
    }
  }

  await writePinnedFile(accountId, unique);
  return unique;
}

export async function setPeerPinned(
  accountId: number,
  peerId: number,
  pinned: boolean,
): Promise<number[]> {
  const current = await loadPinnedPeerIds(accountId);

  if (pinned) {
    const next = [peerId, ...current.filter((entry) => entry !== peerId)];
    return savePinnedPeerIds(accountId, next);
  }

  return savePinnedPeerIds(
    accountId,
    current.filter((entry) => entry !== peerId),
  );
}
