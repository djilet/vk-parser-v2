import { loadConfig } from '../config.js';
import { launchBrowser, openVkhost, saveTokenFromUrl } from '../browser.js';
import { extractTokenFromUrl } from '../token/storage.js';
import {
  clickContinueAs,
  clickVkApp,
  VK_COM_APP_ID,
  waitForAccessTokenUrl,
  waitForOAuthPage,
} from '../vkhost/auth-flow.js';

export async function runTokenCommand(): Promise<void> {
  const config = loadConfig();
  const appId = config.appId ?? VK_COM_APP_ID;

  console.log(`Открываю vkhost.github.io, приложение: ${config.appName} (${appId})`);

  const browser = await launchBrowser({ headless: false });
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
    await saveTokenFromUrl(tokenUrl);

    const saved = extractTokenFromUrl(tokenUrl)!;
    console.log('');
    console.log('Токен сохранён в .vk-token.json');
    if (saved.userId) console.log('user_id:', saved.userId);
    if (saved.expiresIn) console.log('expires_in:', saved.expiresIn, 'сек');
    console.log('access_token:', saved.accessToken);
  } finally {
    await browser.close();
  }
}
