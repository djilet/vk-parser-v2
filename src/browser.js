import puppeteer from 'puppeteer';
import { config } from './config.js';

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

  // CHROME_PATH — не установлен по умолчанию нарочно: реальный установленный Google Chrome
  // имеет тот же bundle id, что и обычный Chrome пользователя, и при уже запущенном обычном
  // Chrome macOS вместо нового процесса шлёт Apple Event существующему инстансу и тут же
  // завершает наш процесс — окно не открывается, а page.goto падает с
  // net::ERR_SOCKET_NOT_CONNECTED, т.к. CDP-порт умирает на полпути. Без явного пути puppeteer
  // использует свой bundled Chrome for Testing, который с обычным Chrome не конфликтует.
  const executablePath = process.env.CHROME_PATH;
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
