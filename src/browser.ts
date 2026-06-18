import puppeteer, { type Browser, type Page } from 'puppeteer';
import { VKHOST_URL, paths } from './config.js';
import { extractTokenFromUrl, saveToken } from './token/storage.js';

export type LaunchOptions = {
  headless?: boolean;
};

export async function launchBrowser(options: LaunchOptions = {}): Promise<Browser> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  return puppeteer.launch({
    headless: options.headless ?? false,
    userDataDir: paths.browserProfile,
    defaultViewport: null,
    args: ['--start-maximized'],
    ...(executablePath ? { executablePath } : { channel: 'chrome' }),
  });
}

export async function openVkhost(page: Page): Promise<void> {
  await page.goto(VKHOST_URL, { waitUntil: 'networkidle2' });
}

export function watchForToken(browser: Browser, onToken: (token: string) => void): void {
  const checkPage = (page: Page) => {
    const tryExtract = (url: string) => {
      const parsed = extractTokenFromUrl(url);
      if (parsed) onToken(parsed.accessToken);
    };

    tryExtract(page.url());

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        tryExtract(frame.url());
      }
    });
  };

  void browser.pages().then((pages) => {
    for (const page of pages) {
      checkPage(page);
    }
  });

  browser.on('targetcreated', async (target) => {
    const page = await target.page();
    if (page) checkPage(page);
  });
}

export async function waitForTokenInBrowser(browser: Browser, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Таймаут: токен не получен'));
    }, timeoutMs);

    watchForToken(browser, (token) => {
      clearTimeout(timer);
      resolve(token);
    });
  });
}

export async function saveTokenFromUrl(url: string): Promise<void> {
  const parsed = extractTokenFromUrl(url);
  if (!parsed) {
    throw new Error('В URL нет access_token');
  }

  await saveToken(parsed);
}
