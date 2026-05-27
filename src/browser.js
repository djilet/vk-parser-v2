import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { config } from './config.js';

const DEFAULT_CHROME_PATHS = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
};

function resolveChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const defaultPath = DEFAULT_CHROME_PATHS[process.platform];
  if (defaultPath && existsSync(defaultPath)) return defaultPath;

  return undefined;
}

/**
 * @returns {Promise<import('puppeteer').Browser>}
 */
export async function launchBrowser() {
  if (config.connectUrl) {
    console.log(`Подключение к Chrome: ${config.connectUrl}`);
    return puppeteer.connect({
      browserURL: config.connectUrl,
      defaultViewport: null,
    });
  }

  const executablePath = resolveChromePath();
  console.log(executablePath ? `Запуск Chrome: ${executablePath}` : 'Запуск bundled Chrome...');

  return puppeteer.launch({
    headless: config.headless,
    executablePath,
    userDataDir: config.userDataDir,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
}
