import puppeteer, { type Browser, type Page } from 'puppeteer';
import { VKHOST_URL, type BrowserPaths } from './config.js';
import { extractTokenFromUrl, saveTokenForBrowser } from './token/store.js';
import type { BrowserId } from './config.js';

export type LaunchOptions = {
  headless?: boolean;
  paths: BrowserPaths;
};

export async function launchBrowser(options: LaunchOptions): Promise<Browser> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  return puppeteer.launch({
    headless: options.headless ?? false,
    userDataDir: options.paths.browserProfile,
    defaultViewport: null,
    args: ['--start-maximized'],
    ...(executablePath ? { executablePath } : { channel: 'chrome' }),
  });
}

export async function openVkhost(page: Page): Promise<void> {
  await page.goto(VKHOST_URL, { waitUntil: 'networkidle2' });
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
