import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Корень проекта, а не process.cwd() — та же причина, что в src/api/tokenStore.js.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function tokenFilePath(browserId) {
  return resolve(PROJECT_ROOT, 'tokens', `browser-${browserId}.json`);
}

/** Достаёт access_token и сопутствующие поля из URL вида .../blank.html#access_token=...&expires_in=... */
export function extractTokenFromUrl(url) {
  const match = url.match(/access_token=([^&]+)/);
  if (!match) {
    return null;
  }

  const accessToken = decodeURIComponent(match[1]);
  const expiresInMatch = url.match(/expires_in=(\d+)/);
  const userIdMatch = url.match(/user_id=(\d+)/);

  const expiresIn = expiresInMatch ? Number(expiresInMatch[1]) : undefined;

  return {
    accessToken,
    expiresIn,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
    userId: userIdMatch ? Number(userIdMatch[1]) : undefined,
  };
}

export async function saveToken(browserId, token) {
  const payload = {
    browserId,
    ...token,
    savedAt: new Date().toISOString(),
  };

  const filePath = tokenFilePath(browserId);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

  return payload;
}

export async function loadToken(browserId) {
  try {
    const raw = await readFile(tokenFilePath(browserId), 'utf8');
    const data = JSON.parse(raw);

    return data?.accessToken ? data : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token) {
  if (!token.expiresAt) {
    return false;
  }

  return Date.parse(token.expiresAt) <= Date.now();
}

export async function getAccessToken(browserId) {
  const token = await loadToken(browserId);

  if (!token) {
    throw new Error(`Токен VK для браузера #${browserId} не найден. Запустите: npm run vk-token`);
  }

  if (isTokenExpired(token)) {
    throw new Error(`Токен VK для браузера #${browserId} истёк. Запустите: npm run vk-token`);
  }

  return token.accessToken;
}
