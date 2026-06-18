import { readFile, writeFile } from 'node:fs/promises';
import { paths } from '../config.js';

export type SavedToken = {
  accessToken: string;
  expiresIn?: number;
  userId?: number;
  savedAt: string;
};

export function extractTokenFromUrl(url: string): Omit<SavedToken, 'savedAt'> | null {
  const hashMatch = url.match(/access_token=([^&]+)/);
  if (!hashMatch) return null;

  const accessToken = decodeURIComponent(hashMatch[1]);
  const expiresInMatch = url.match(/expires_in=(\d+)/);
  const userIdMatch = url.match(/user_id=(\d+)/);

  return {
    accessToken,
    expiresIn: expiresInMatch ? Number(expiresInMatch[1]) : undefined,
    userId: userIdMatch ? Number(userIdMatch[1]) : undefined,
  };
}

export async function saveToken(token: Omit<SavedToken, 'savedAt'>): Promise<SavedToken> {
  const saved: SavedToken = {
    ...token,
    savedAt: new Date().toISOString(),
  };

  await writeFile(paths.tokenFile, JSON.stringify(saved, null, 2) + '\n', 'utf8');
  return saved;
}

export async function loadToken(): Promise<SavedToken | null> {
  try {
    const raw = await readFile(paths.tokenFile, 'utf8');
    return JSON.parse(raw) as SavedToken;
  } catch {
    return null;
  }
}
