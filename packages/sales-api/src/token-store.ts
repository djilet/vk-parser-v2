import { readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repoRoot } from '@vk-sales-bot/core';

export type ApiTokenEnv = { phone: string | null; tokenFile: string };

function tokenFilePath(env: ApiTokenEnv): string {
  return resolve(repoRoot(), env.tokenFile);
}

/**
 * Токен живёт год, поэтому его держим на диске: скрипты запускаются по отдельности, и без
 * кеша каждый запуск заново дёргал бы выдачу кода.
 */
export async function readStoredToken(env: ApiTokenEnv): Promise<string | null> {
  try {
    const raw = await readFile(tokenFilePath(env), 'utf8');
    const data = JSON.parse(raw) as { token?: unknown; phone?: unknown };

    if (typeof data.token !== 'string' || data.token.length === 0) {
      return null;
    }

    // Токен привязан к телефону: сменили телефон в .env — старый токен не подходит.
    if (data.phone && data.phone !== env.phone) {
      return null;
    }

    return data.token;
  } catch {
    return null;
  }
}

export async function writeStoredToken(env: ApiTokenEnv, token: string): Promise<void> {
  const payload = { token, phone: env.phone, saved_at: new Date().toISOString() };

  await writeFile(tokenFilePath(env), `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export async function clearStoredToken(env: ApiTokenEnv): Promise<void> {
  try {
    await unlink(tokenFilePath(env));
  } catch {
    // файла может не быть — это нормально
  }
}
