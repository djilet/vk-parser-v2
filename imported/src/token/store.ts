import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type BrowserId, BROWSER_IDS, getBrowserPaths } from '../config.js';

export type SavedToken = {
  browserId: BrowserId;
  accessToken: string;
  expiresIn?: number;
  expiresAt?: string;
  userId?: number;
  email?: string;
  appId?: number;
  savedAt?: string;
  needsSession?: boolean;
};

/** Refresh tokens proactively 1 second before the 24h VK lifetime. */
export const TOKEN_REFRESH_AFTER_MS = 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000;

export function extractTokenFromUrl(url: string): Omit<SavedToken, 'savedAt' | 'browserId'> | null {
  const hashMatch = url.match(/access_token=([^&]+)/);
  if (!hashMatch) return null;

  const accessToken = decodeURIComponent(hashMatch[1]);
  const expiresInMatch = url.match(/expires_in=(\d+)/);
  const userIdMatch = url.match(/user_id=(\d+)/);
  const emailMatch = url.match(/email=([^&]+)/);

  const expiresIn = expiresInMatch ? Number(expiresInMatch[1]) : undefined;

  return {
    accessToken,
    expiresIn,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
    userId: userIdMatch ? Number(userIdMatch[1]) : undefined,
    email: emailMatch ? decodeURIComponent(emailMatch[1]) : undefined,
  };
}

function buildSavedToken(
  browserId: BrowserId,
  token: Omit<SavedToken, 'savedAt' | 'browserId'>,
): SavedToken {
  const savedAt = new Date().toISOString();

  return {
    browserId,
    ...token,
    expiresAt:
      token.expiresAt ??
      (token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000).toISOString() : undefined),
    savedAt,
  };
}

export function getTokenCreationTime(token: SavedToken, now = Date.now()): number {
  if (token.savedAt) {
    const savedAt = Date.parse(token.savedAt);
    if (!Number.isNaN(savedAt)) {
      return savedAt;
    }
  }

  if (token.expiresAt) {
    const expiresAt = Date.parse(token.expiresAt);
    if (!Number.isNaN(expiresAt)) {
      const expiresIn = token.expiresIn ?? 86_400;
      return expiresAt - expiresIn * 1000;
    }
  }

  return now;
}

export function isTokenRefreshDue(token: SavedToken, now = Date.now()): boolean {
  return now - getTokenCreationTime(token, now) >= TOKEN_REFRESH_AFTER_MS;
}

export async function ensureTokenSavedAt(token: SavedToken): Promise<SavedToken> {
  if (token.savedAt && !Number.isNaN(Date.parse(token.savedAt))) {
    return token;
  }

  const savedAt = new Date(getTokenCreationTime(token)).toISOString();
  const updated = { ...token, savedAt };
  await saveToken(updated);
  return updated;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function migrateLegacyToken(browserId: BrowserId): Promise<SavedToken | null> {
  const legacyPaths = [
    join(process.cwd(), `.vk-token-${browserId}.json`),
    join(process.cwd(), '.vk-token.json'),
  ];

  for (const path of legacyPaths) {
    const legacy = await readJsonFile<Partial<SavedToken>>(path);
    if (!legacy?.accessToken) continue;

    const saved = buildSavedToken(browserId, {
      accessToken: legacy.accessToken,
      expiresIn: legacy.expiresIn,
      expiresAt: legacy.expiresAt,
      userId: legacy.userId,
      email: legacy.email,
      appId: legacy.appId,
    });

    await saveToken(saved);
    return saved;
  }

  return null;
}

export async function saveToken(token: SavedToken): Promise<SavedToken> {
  const tokenFile = getBrowserPaths(token.browserId).tokenFile;
  await mkdir(dirname(tokenFile), { recursive: true });
  await writeFile(tokenFile, JSON.stringify(token, null, 2) + '\n', 'utf8');
  return token;
}

export async function saveTokenForBrowser(
  browserId: BrowserId,
  token: Omit<SavedToken, 'savedAt' | 'browserId' | 'needsSession'>,
): Promise<SavedToken> {
  return saveToken(buildSavedToken(browserId, token));
}

export async function markTokenNeedsSession(browserId: BrowserId): Promise<void> {
  const { tokenFile } = getBrowserPaths(browserId);
  const current = await readJsonFile<SavedToken>(tokenFile);

  if (!current?.accessToken || current.needsSession) {
    return;
  }

  await saveToken({ ...current, browserId, needsSession: true });
}

export async function clearToken(browserId: BrowserId): Promise<boolean> {
  const { tokenFile } = getBrowserPaths(browserId);

  try {
    await unlink(tokenFile);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

export async function loadToken(browserId: BrowserId): Promise<SavedToken | null> {
  const { tokenFile } = getBrowserPaths(browserId);
  const current = await readJsonFile<SavedToken>(tokenFile);

  if (current?.accessToken) {
    const token = { ...current, browserId };
    return ensureTokenSavedAt(token);
  }

  return migrateLegacyToken(browserId);
}

export async function loadAllTokens(): Promise<SavedToken[]> {
  const tokens: SavedToken[] = [];

  for (const browserId of BROWSER_IDS) {
    const token = await loadToken(browserId);
    if (token) tokens.push(token);
  }

  return tokens;
}

export function isTokenExpired(token: SavedToken): boolean {
  if (!token.expiresAt) return false;
  return Date.parse(token.expiresAt) <= Date.now();
}

export async function getAccessToken(browserId: BrowserId): Promise<string> {
  const token = await loadToken(browserId);

  if (!token) {
    throw new Error(`Токен для браузера #${browserId} не найден. Запустите: npm run vk:token -- --browser ${browserId}`);
  }

  if (isTokenExpired(token)) {
    throw new Error(`Токен для браузера #${browserId} истёк. Запустите: npm run vk:token -- --browser ${browserId}`);
  }

  return token.accessToken;
}

export async function getTokenByUserId(userId: number): Promise<SavedToken> {
  const tokens = await loadAllTokens();
  const token = tokens.find((entry) => entry.userId === userId);

  if (!token) {
    const available = tokens
      .map((entry) => entry.userId)
      .filter((id): id is number => id != null)
      .join(', ');

    throw new Error(
      `Токен для accountId=${userId} не найден.${available ? ` Доступные: ${available}` : ' Сначала получите токен: npm run vk:token'}`,
    );
  }

  if (isTokenExpired(token)) {
    throw new Error(
      `Токен для accountId=${userId} истёк. Запустите: npm run vk:token -- --browser ${token.browserId}`,
    );
  }

  return token;
}

export function formatTokenStatus(token: SavedToken): string {
  const status = isTokenExpired(token) ? 'истёк' : 'активен';
  const parts = [
    `браузер #${token.browserId}`,
    `user_id=${token.userId ?? '—'}`,
    token.email ? `email=${token.email}` : null,
    `статус: ${status}`,
    token.expiresAt ? `до ${new Date(token.expiresAt).toLocaleString('ru-RU')}` : null,
  ].filter(Boolean);

  return parts.join(', ');
}
