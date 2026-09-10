import { config } from './config.js';
import { launchBrowser } from './browser.js';
import { extractTokenFromUrl, loadToken, saveToken } from './vk/tokenStore.js';
import {
  clickContinueAs,
  clickVkApp,
  VK_COM_APP_ID,
  waitForAccessTokenUrl,
  waitForOAuthPage,
} from './vk/authFlow.js';

const VKHOST_URL = 'https://vkhost.github.io/';

async function main() {
  const browserId = config.vk.browserId;

  console.log(`Браузер #${browserId}`);
  console.log('Открываю vkhost.github.io, приложение: vk.com');

  // Тот же профиль (config.userDataDir), что и у остального скрапинга — в нём уже есть сессия
  // VK, поэтому «Продолжить как …» появляется сразу, без ручного логина. Свежий пустой профиль
  // такой сессии не имеет и требует логиниться вручную (несовместимо с HEADLESS=true).
  const browser = await launchBrowser();
  // Не трогаем чужие вкладки — если это CONNECT_URL к уже запущенному Chrome с открытым
  // парсингом, pages()[0] могла бы оказаться вкладкой пользователя.
  const page = await browser.newPage();

  try {
    const tokenPromise = waitForAccessTokenUrl(browser);

    await page.goto(VKHOST_URL, { waitUntil: 'networkidle2' });
    console.log('Кликаю по приложению vk.com...');
    await clickVkApp(page, VK_COM_APP_ID);

    const oauthPage = await waitForOAuthPage(browser);
    console.log('Открылась страница авторизации:', oauthPage.url());
    await clickContinueAs(oauthPage);

    const tokenUrl = await tokenPromise;
    const parsed = extractTokenFromUrl(tokenUrl);
    if (!parsed) {
      throw new Error('В URL нет access_token');
    }

    await saveToken(browserId, parsed);

    const saved = await loadToken(browserId);
    if (!saved) {
      throw new Error('Токен не сохранился локально');
    }

    console.log('');
    console.log(`Токен сохранён: tokens/browser-${browserId}.json`);
    if (saved.userId) console.log('user_id:', saved.userId);
    if (saved.expiresAt) console.log('expiresAt:', saved.expiresAt);
  } finally {
    await page.close().catch(() => {});

    // puppeteer.connect() (CONNECT_URL) — close() убил бы весь удалённый Chrome, а не только
    // это соединение. puppeteer.launch() — обычный close() корректно завершает сам процесс.
    if (config.connectUrl) {
      await browser.disconnect();
    } else {
      await browser.close();
    }
  }
}

main().catch((err) => {
  console.error(err);
  console.error(
    '\nЕсли ошибка про занятый профиль — не запускайте npm run vk-token одновременно с другим '
    + 'скриптом, использующим тот же Chrome-профиль (./chrome-profile).'
  );
  process.exit(1);
});
