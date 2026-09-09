import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../config.js';

// Корень проекта, а не process.cwd() — иначе запуск скрипта из другой директории
// клал бы токен вне проекта, туда, где его уже не прикрывает .gitignore.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function tokenFilePath() {
  return resolve(PROJECT_ROOT, config.api.tokenFile);
}

/**
 * Токен живёт год, поэтому его держим на диске: скрипты запускаются по отдельности,
 * и без кеша каждый запуск заново дёргал бы выдачу кода.
 */
export async function readStoredToken() {
  try {
    const raw = await readFile(tokenFilePath(), 'utf8');
    const data = JSON.parse(raw);

    if (typeof data?.token !== 'string' || data.token.length === 0) {
      return null;
    }

    // Токен привязан к телефону: сменили телефон в .env — старый токен не подходит.
    if (data.phone && data.phone !== config.api.phone) {
      return null;
    }

    return data.token;
  } catch {
    return null;
  }
}

export async function writeStoredToken(token) {
  const payload = {
    token,
    phone: config.api.phone,
    saved_at: new Date().toISOString(),
  };

  await writeFile(tokenFilePath(), `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export async function clearStoredToken() {
  try {
    await unlink(tokenFilePath());
  } catch {
    // файла может не быть — это нормально
  }
}
