import { config } from './config.js';
import { launchBrowser } from './browser.js';

const VKHOST_URL = 'https://vkhost.github.io/';

// Открывает только первую страницу — без клика по приложению и без ожидания токена.
// Нужен, чтобы вручную залогиниться в VK в отдельном/свежем chrome-profile-<N> (например,
// для второго аккаунта), а затем уже запускать npm run vk-token для получения токена из
// этой сохранённой сессии.
async function main() {
  const browserId = config.vk.browserId;

  console.log(`Браузер #${browserId}`);
  console.log(`Профиль: ${config.userDataDir}`);
  console.log(`Открываю ${VKHOST_URL}`);
  console.log('');
  console.log('Войдите в VK в открывшемся окне браузера (кнопкой входа на странице или через vk.com).');
  console.log('Сессия сохранится в профиле браузера. После входа запустите:');
  console.log(`npm run vk-token -- --browser ${browserId}`);

  const browser = await launchBrowser();
  const page = await browser.newPage();

  for (const existingPage of await browser.pages()) {
    if (existingPage !== page) {
      await existingPage.close().catch(() => {});
    }
  }

  await page.goto(VKHOST_URL, { waitUntil: 'networkidle2' });

  // Отсоединяемся, не закрывая сам браузер — он должен остаться открытым для ручного логина.
  browser.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
