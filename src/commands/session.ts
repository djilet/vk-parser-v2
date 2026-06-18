import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { type BrowserId, VKHOST_URL } from '../config.js';
import { launchBrowser, openVkhost } from '../browser.js';
import { loadConfig } from '../config.js';

export async function runSessionCommand(browserId: BrowserId): Promise<void> {
  const config = loadConfig(browserId);

  console.log(`Браузер #${config.browserId}`);
  console.log('Открываю', VKHOST_URL);
  console.log('');
  console.log('Войдите в VK и при необходимости пройдите авторизацию приложения.');
  console.log(`Сессия сохранится в ${config.paths.browserProfile}`);
  console.log('');
  console.log('Когда закончите — закройте браузер или нажмите Enter в терминале.');

  const browser = await launchBrowser({ headless: false, paths: config.paths });
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  await openVkhost(page);

  const rl = readline.createInterface({ input, output });

  await Promise.race([
    new Promise<void>((resolve) => browser.on('disconnected', resolve)),
    rl.question(''),
  ]);

  rl.close();

  if (browser.connected) {
    await browser.close();
  }

  console.log(`Сессия браузера #${config.browserId} сохранена.`);
  console.log(`Теперь можно запустить: npm run vk:token -- --browser ${config.browserId}`);
}
