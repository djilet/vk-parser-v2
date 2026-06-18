import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { VKHOST_URL } from '../config.js';
import { launchBrowser, openVkhost } from '../browser.js';

export async function runSessionCommand(): Promise<void> {
  console.log('Открываю браузер на', VKHOST_URL);
  console.log('');
  console.log('Войдите в VK и при необходимости пройдите авторизацию приложения.');
  console.log('Сессия сохранится в .browser-profile/');
  console.log('');
  console.log('Когда закончите — закройте браузер или нажмите Enter в терминале.');

  const browser = await launchBrowser({ headless: false });
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

  console.log('Сессия сохранена. Теперь можно запустить: npm run vk:token');
}
