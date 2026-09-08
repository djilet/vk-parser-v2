import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { VKHOST_URL, VK_LOGIN_URL, type BrowserPaths } from './config.js';
import { extractTokenFromUrl, saveTokenForBrowser } from './token/store.js';
import type { BrowserId } from './config.js';

const DEBUG_PORT_BASE = 9333;

export type LaunchOptions = {
  headless?: boolean;
  paths: BrowserPaths;
  browserId: BrowserId;
};

export function getBrowserDebugPort(browserId: BrowserId): number {
  return DEBUG_PORT_BASE + browserId;
}

async function fetchBrowserWebSocketUrl(port: number): Promise<string | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(2_000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { webSocketDebuggerUrl?: string };
    return data.webSocketDebuggerUrl ?? null;
  } catch {
    return null;
  }
}

async function clearStaleProfileLocks(userDataDir: string): Promise<void> {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try {
      await unlink(join(userDataDir, name));
    } catch {
      // ignore missing lock files
    }
  }
}

async function connectToBrowser(port: number): Promise<Browser | null> {
  const webSocketUrl = await fetchBrowserWebSocketUrl(port);
  if (!webSocketUrl) {
    return null;
  }

  return puppeteer.connect({ browserWSEndpoint: webSocketUrl });
}

function launchOptions(options: LaunchOptions, debugPort: number) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  return {
    headless: options.headless ?? false,
    userDataDir: options.paths.browserProfile,
    defaultViewport: null,
    args: ['--start-maximized', `--remote-debugging-port=${debugPort}`, '--no-sandbox', '--disable-setuid-sandbox'],
    ...(executablePath ? { executablePath } : { channel: 'chrome' as const }),
  };
}

function isProfileLockedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('already running') || message.includes('userDataDir');
}

export async function launchBrowser(options: LaunchOptions): Promise<Browser> {
  const debugPort = getBrowserDebugPort(options.browserId);

  const existing = await connectToBrowser(debugPort);
  if (existing) {
    return existing;
  }

  await clearStaleProfileLocks(options.paths.browserProfile);

  try {
    return await puppeteer.launch(launchOptions(options, debugPort));
  } catch (error) {
    if (!isProfileLockedError(error)) {
      throw error;
    }

    const connected = await connectToBrowser(debugPort);
    if (connected) {
      return connected;
    }

    await clearStaleProfileLocks(options.paths.browserProfile);

    return puppeteer.launch(launchOptions(options, debugPort));
  }
}

function isNavigationDetachedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('frame was detached');
}

export async function openVkhost(page: Page): Promise<void> {
  await page.goto(VKHOST_URL, { waitUntil: 'networkidle2' });
}

export async function openVkLogin(page: Page): Promise<void> {
  try {
    await page.goto(VK_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (error) {
    if (!isNavigationDetachedError(error)) {
      throw error;
    }

    const url = page.url();
    if (!url.includes('vk.com') && !url.includes('id.vk.com')) {
      throw error;
    }
  }
}

export async function saveTokenFromUrl(
  url: string,
  browserId: BrowserId,
  appId?: number,
): Promise<void> {
  const parsed = extractTokenFromUrl(url);
  if (!parsed) {
    throw new Error('В URL нет access_token');
  }

  await saveTokenForBrowser(browserId, { ...parsed, appId });
}
