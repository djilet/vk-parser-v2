import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import type { BrowserId } from './accounts.js';
import type { BrowserPaths } from './paths.js';

const DEBUG_PORT_BASE = 9333;

export type LaunchOptions = {
  headless?: boolean;
  paths: BrowserPaths;
  browserId: BrowserId;
  /** CDP endpoint of an already-running Chrome, e.g. http://127.0.0.1:9222 — bypasses profile launch entirely. */
  connectUrl?: string | null;
};

export type LaunchResult = {
  browser: Browser;
  /** true when we attached to an already-running Chrome (via connectUrl or CDP reconnect) rather than launching our own. */
  wasRemote: boolean;
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
  // Не установлен по умолчанию нарочно: реальный установленный Google Chrome имеет тот же
  // bundle id, что и обычный Chrome пользователя, и при уже запущенном обычном Chrome macOS
  // вместо нового процесса шлёт Apple Event существующему инстансу и тут же завершает наш
  // процесс — окно не открывается, а page.goto падает с net::ERR_SOCKET_NOT_CONNECTED, т.к.
  // CDP-порт умирает на полпути. Без явного пути puppeteer использует свой bundled Chrome for
  // Testing, который с обычным Chrome не конфликтует.
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? process.env.CHROME_PATH;

  return {
    headless: options.headless ?? false,
    userDataDir: options.paths.browserProfile,
    defaultViewport: null,
    args: ['--start-maximized', `--remote-debugging-port=${debugPort}`, '--no-sandbox', '--disable-setuid-sandbox'],
    ...(executablePath ? { executablePath } : {}),
  };
}

function isProfileLockedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('already running') || message.includes('userDataDir');
}

export async function launchBrowser(options: LaunchOptions): Promise<LaunchResult> {
  if (options.connectUrl) {
    console.log(`Подключение к Chrome: ${options.connectUrl}`);
    const browser = await puppeteer.connect({ browserURL: options.connectUrl, defaultViewport: null });
    return { browser, wasRemote: true };
  }

  const debugPort = getBrowserDebugPort(options.browserId);

  const existing = await connectToBrowser(debugPort);
  if (existing) {
    return { browser: existing, wasRemote: true };
  }

  await clearStaleProfileLocks(options.paths.browserProfile);

  try {
    return { browser: await puppeteer.launch(launchOptions(options, debugPort)), wasRemote: false };
  } catch (error) {
    if (!isProfileLockedError(error)) {
      throw error;
    }

    const connected = await connectToBrowser(debugPort);
    if (connected) {
      return { browser: connected, wasRemote: true };
    }

    await clearStaleProfileLocks(options.paths.browserProfile);

    return { browser: await puppeteer.launch(launchOptions(options, debugPort)), wasRemote: false };
  }
}

/**
 * Closing a CDP-attached Chrome kills the user's actual browser window, not just our
 * connection to it — so a remote browser must be disconnect()ed, never close()d. A browser
 * we launched ourselves is safe to close() once we're done with it.
 */
export async function closeBrowser(result: LaunchResult): Promise<void> {
  if (result.wasRemote) {
    result.browser.disconnect();
    return;
  }

  await result.browser.close();
}

function isNavigationDetachedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('frame was detached');
}

export async function openVkLogin(page: Page, loginUrl: string): Promise<void> {
  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
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

export const VKHOST_URL = 'https://vkhost.github.io/';

export async function openVkhost(page: Page): Promise<void> {
  await page.goto(VKHOST_URL, { waitUntil: 'networkidle2' });
}
