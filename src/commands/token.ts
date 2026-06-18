import { BROWSER_IDS, loadConfig, type BrowserId } from '../config.js';
import { launchBrowser, openVkhost, saveTokenFromUrl } from '../browser.js';
import { loadToken } from '../token/store.js';
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
    await saveTokenFromUrl(tokenUrl, config.browserId, appId);

    const saved = await loadToken(config.browserId);
    if (!saved) {
      throw new Error('Токен не сохранился локально');
    }

    console.log('');
    console.log(`Токен сохранён: ${config.paths.tokenFile}`);
    if (saved.userId) console.log('user_id:', saved.userId);
    if (saved.email) console.log('email:', saved.email);
    if (saved.expiresAt) console.log('expiresAt:', saved.expiresAt);
    console.log('access_token:', saved.accessToken);
  } finally {
    await browser.close();
  }
}

export async function runAllTokensCommand(): Promise<void> {
  console.log(`Получаю токены для браузеров: ${BROWSER_IDS.join(', ')}\n`);

  const results: Array<{ browserId: BrowserId; ok: boolean; error?: string }> = [];

  for (const browserId of BROWSER_IDS) {
    console.log('─'.repeat(50));

    try {
      await runTokenCommand(browserId);
      results.push({ browserId, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\nОшибка для браузера #${browserId}: ${message}\n`);
      results.push({ browserId, ok: false, error: message });
    }
  }

  console.log('═'.repeat(50));
  console.log('Итог:\n');

  for (const result of results) {
    const config = loadConfig(result.browserId);
    if (result.ok) {
      console.log(`✓ Браузер #${result.browserId} — токен сохранён (${config.paths.tokenFile})`);
      continue;
    }

    console.log(`✗ Браузер #${result.browserId} — ${result.error}`);
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    throw new Error(`Не удалось получить токены для браузеров: ${failed.map((r) => r.browserId).join(', ')}`);
  }
}
