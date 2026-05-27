import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SENT_LOG_PATH = resolve('sent.json');

function normalizeEntry(entry) {
  if (typeof entry === 'string') {
    return entry;
  }

  if (entry && typeof entry.msgUrl === 'string') {
    return entry.msgUrl;
  }

  return null;
}

export async function loadSentLog() {
  if (!existsSync(SENT_LOG_PATH)) {
    return [];
  }

  try {
    const data = JSON.parse(await readFile(SENT_LOG_PATH, 'utf8'));
    if (!Array.isArray(data)) {
      return [];
    }

    return [...new Set(data.map(normalizeEntry).filter(Boolean))];
  } catch {
    return [];
  }
}

export async function saveSentLog(msgUrls) {
  const uniqueMsgUrls = [...new Set(msgUrls.filter(Boolean))];
  await writeFile(SENT_LOG_PATH, `${JSON.stringify(uniqueMsgUrls, null, 2)}\n`, 'utf8');
  return SENT_LOG_PATH;
}

export function isAlreadySent(msgUrls, community) {
  return msgUrls.includes(community.msgUrl);
}

export async function appendSentMsgUrl(msgUrl, msgUrls) {
  if (!msgUrl || msgUrls.includes(msgUrl)) {
    return SENT_LOG_PATH;
  }

  msgUrls.push(msgUrl);
  return saveSentLog(msgUrls);
}
