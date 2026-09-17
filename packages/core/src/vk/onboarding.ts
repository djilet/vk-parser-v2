import type { BrowserId } from '../accounts.js';
import { BROWSER_IDS } from '../accounts.js';
import { closeBrowser, launchBrowser, openVkhost, openVkLogin } from '../browser.js';
import type { EnvConfig } from '../env.js';
import { getBrowserPaths } from '../paths.js';
import { clickContinueAs, clickVkApp, VK_COM_APP_ID, waitForAccessTokenUrl, waitForOAuthPage } from './auth-flow.js';
import {
  isTokenRefreshDue,
  loadAllTokens,
  loadToken,
  markTokenNeedsSession,
  saveTokenFromUrl,
  type SavedToken,
} from './token-store.js';

/**
 * VK session/token acquisition, shared by apps/cli (interactive) and apps/server
 * (POST /api/accounts/:browserId/{session,token}, driving the web UI's TokenSetupAlert).
 */

export type SessionCommandOptions = {
  browserId: BrowserId;
  env: Pick<EnvConfig, 'vk'>;
};

export async function runSessionCommand(options: SessionCommandOptions): Promise<{ browserProfile: string }> {
  const paths = getBrowserPaths(options.browserId);

  console.log(`Браузер #${options.browserId}`);
  console.log('Открываю', options.env.vk.loginUrl);
  console.log('');
  console.log('Войдите в VK в открывшемся окне браузера.');
  console.log(`Сессия сохранится в ${paths.browserProfile}`);
  console.log('');
  console.log('Браузер останется открытым. Затем получите токен:');
  console.log(`vk-sales-bot vk token --browser ${options.browserId}`);

  const launched = await launchBrowser({
    headless: false,
    paths,
    browserId: options.browserId,
    connectUrl: options.env.vk.connectUrl,
  });
  const page = await launched.browser.newPage();

  for (const existingPage of await launched.browser.pages()) {
    if (existingPage !== page) {
      await existingPage.close().catch(() => undefined);
    }
  }

  await openVkLogin(page, options.env.vk.loginUrl);
  launched.browser.disconnect();

  return { browserProfile: paths.browserProfile };
}

export type TokenCommandOptions = {
  browserId: BrowserId;
  env: Pick<EnvConfig, 'vk'>;
  headless?: boolean;
  appId?: number;
};

export async function runTokenCommand(options: TokenCommandOptions): Promise<SavedToken> {
  const paths = getBrowserPaths(options.browserId);
  const appId = options.appId ?? VK_COM_APP_ID;

  console.log(`Браузер #${options.browserId}`);
  console.log(`Открываю vkhost.github.io, приложение: vk.com (${appId})`);

  const launched = await launchBrowser({
    headless: options.headless ?? options.env.vk.headless,
    paths,
    browserId: options.browserId,
    connectUrl: options.env.vk.connectUrl,
  });
  const page = (await launched.browser.pages())[0] ?? (await launched.browser.newPage());

  try {
    const tokenPromise = waitForAccessTokenUrl(launched.browser);

    await openVkhost(page);
    console.log('Кликаю по приложению vk.com...');
    await clickVkApp(page, appId);

    const oauthPage = await waitForOAuthPage(launched.browser);
    console.log('Открылась страница авторизации:', oauthPage.url());
    await clickContinueAs(oauthPage);

    const tokenUrl = await tokenPromise;
    await saveTokenFromUrl(tokenUrl, options.browserId, appId);

    const saved = await loadToken(options.browserId);
    if (!saved) {
      throw new Error('Токен не сохранился локально');
    }

    console.log('');
    console.log(`Токен сохранён: ${paths.tokenFile}`);
    if (saved.userId) console.log('user_id:', saved.userId);
    if (saved.email) console.log('email:', saved.email);
    if (saved.expiresAt) console.log('expiresAt:', saved.expiresAt);
    console.log('access_token:', saved.accessToken);

    return saved;
  } finally {
    // Closing a CDP-attached Chrome would kill the user's actual browser window — closeBrowser
    // disconnects instead of close()ing when we attached to an already-running instance.
    await closeBrowser(launched);
  }
}

export async function runAllTokensCommand(env: Pick<EnvConfig, 'vk'>): Promise<void> {
  console.log(`Получаю токены для браузеров: ${BROWSER_IDS.join(', ')}\n`);

  const results: Array<{ browserId: BrowserId; ok: boolean; error?: string }> = [];

  for (const browserId of BROWSER_IDS) {
    console.log('─'.repeat(50));

    try {
      await runTokenCommand({ browserId, env });
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
    const paths = getBrowserPaths(result.browserId);
    if (result.ok) {
      console.log(`✓ Браузер #${result.browserId} — токен сохранён (${paths.tokenFile})`);
      continue;
    }

    console.log(`✗ Браузер #${result.browserId} — ${result.error}`);
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    throw new Error(`Не удалось получить токены для браузеров: ${failed.map((r) => r.browserId).join(', ')}`);
  }
}

export async function runTokenAutoCommand(env: Pick<EnvConfig, 'vk'>): Promise<void> {
  const tokens = await loadAllTokens();
  if (tokens.length === 0) {
    return;
  }

  const dueTokens = tokens.filter((token) => isTokenRefreshDue(token));
  if (dueTokens.length === 0) {
    return;
  }

  console.log(
    `Автообновление токенов (${dueTokens.length}): браузеры ${dueTokens.map((token) => token.browserId).join(', ')}`,
  );

  for (const token of dueTokens) {
    try {
      await runTokenCommand({ browserId: token.browserId, env, headless: true });
      console.log(`Токен браузера #${token.browserId} обновлён`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markTokenNeedsSession(token.browserId);
      console.error(`Не удалось обновить токен браузера #${token.browserId}: ${message}`);
    }
  }
}
