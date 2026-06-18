import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  savedAt: string;
};

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
  token: Omit<SavedToken, 'savedAt' | 'browserId'>,
): Promise<SavedToken> {
  return saveToken(buildSavedToken(browserId, token));
}

export async function loadToken(browserId: BrowserId): Promise<SavedToken | null> {
  const { tokenFile } = getBrowserPaths(browserId);
  const current = await readJsonFile<SavedToken>(tokenFile);

  if (current?.accessToken) {
    return { ...current, browserId };
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
