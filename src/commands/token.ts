import { loadConfig, type BrowserId } from '../config.js';
import { launchBrowser, openVkhost, saveTokenFromUrl } from '../browser.js';
import { extractTokenFromUrl } from '../token/storage.js';
import {
  clickContinueAs,
  clickVkApp,
  VK_COM_APP_ID,
  waitForAccessTokenUrl,
  waitForOAuthPage,
} from '../vkhost/auth-flow.js';

export async function runTokenCommand(browserId: BrowserId): Promise<void> {
  const config = loadConfig(browserId);
  const appId = config.appId ?? VK_COM_APP_ID;

  console.log(`Браузер #${config.browserId}`);
  console.log(`Открываю vkhost.github.io, приложение: ${config.appName} (${appId})`);

  const browser = await launchBrowser({ headless: false, paths: config.paths });
  const page = (await browser.pages())[0] ?? (await browser.newPage());

  try {
    const tokenPromise = waitForAccessTokenUrl(browser);

    await openVkhost(page);
    console.log('Кликаю по приложению vk.com...');
    await clickVkApp(page, appId);

    const oauthPage = await waitForOAuthPage(browser);
    console.log('Открылась страница авторизации:', oauthPage.url());
    await clickContinueAs(oauthPage);

    const tokenUrl = await tokenPromise;
    await saveTokenFromUrl(tokenUrl, config.paths.tokenFile);

    const saved = extractTokenFromUrl(tokenUrl)!;
    console.log('');
    console.log(`Токен сохранён в ${config.paths.tokenFile}`);
    if (saved.userId) console.log('user_id:', saved.userId);
    if (saved.expiresIn) console.log('expires_in:', saved.expiresIn, 'сек');
    console.log('access_token:', saved.accessToken);
  } finally {
    await browser.close();
  }
}
