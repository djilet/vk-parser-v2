import { closeBrowser, launchBrowser, waitForEnter, type BrowserId, type EnvConfig, type LaunchResult } from '@vk-sales-bot/core';
import { getBrowserPaths } from '@vk-sales-bot/core';
import type { Page } from 'puppeteer';

export type LoggedInPage = { launched: LaunchResult; page: Page };

/**
 * The "launch browser, grab page[0], open the VK login page, wait for a manual Enter" preamble
 * that used to be copy-pasted verbatim at the top of six entry scripts (index.js, parseSkip.js,
 * parseDescriptions.js, sendMessages.js, sendMessagesParity.js). One shared place to fix it.
 */
export async function openLoggedInPage(
  browserId: BrowserId,
  env: Pick<EnvConfig, 'vk'>,
  options: { promptMessage?: string } = {},
): Promise<LoggedInPage> {
  const launched = await launchBrowser({
    headless: env.vk.headless,
    paths: getBrowserPaths(browserId),
    browserId,
    connectUrl: env.vk.connectUrl,
  });

  const pages = await launched.browser.pages();
  const page = pages[0] ?? (await launched.browser.newPage());

  console.log(`Открываю страницу входа: ${env.vk.loginUrl}`);
  await page.goto(env.vk.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  console.log('\nВойдите в аккаунт VK в браузере.');
  await waitForEnter(options.promptMessage ?? 'Когда войдёте — нажмите Enter в этой консоли...\n');

  return { launched, page };
}

/**
 * Every scraping/outreach entry script used to end with `await new Promise(() => {})` to keep
 * the browser window open for inspection — which also meant the process never exited on its
 * own and had to be Ctrl+C'd, hostile to any orchestrator (CI, a scheduler, `predev`). Now it's
 * an explicit, opt-in choice.
 */
export async function keepOpenOrClose(launched: LaunchResult, keepOpen: boolean): Promise<void> {
  if (keepOpen) {
    console.log('\nБраузер остаётся открытым — закройте его или нажмите Ctrl+C.');
    await new Promise(() => {});
    return;
  }

  await closeBrowser(launched);
}
