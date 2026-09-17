import { type BrowserId, VK_LOGIN_URL } from '../config.js';
import { launchBrowser, openVkLogin } from '../browser.js';
import { loadConfig } from '../config.js';

export async function runSessionCommand(browserId: BrowserId): Promise<void> {
  const config = loadConfig(browserId);

  console.log(`Браузер #${config.browserId}`);
  console.log('Открываю', VK_LOGIN_URL);
  console.log('');
  console.log('Войдите в VK в открывшемся окне браузера.');
  console.log(`Сессия сохранится в ${config.paths.browserProfile}`);
  console.log('');
  console.log('Браузер останется открытым. Затем получите токен:');
  console.log(`npm run vk:token -- --browser ${config.browserId}`);

  const browser = await launchBrowser({ headless: false, paths: config.paths, browserId: config.browserId });
  const page = await browser.newPage();

  for (const existingPage of await browser.pages()) {
    if (existingPage !== page) {
      await existingPage.close().catch(() => undefined);
    }
  }

  await openVkLogin(page);
  browser.disconnect();
}
