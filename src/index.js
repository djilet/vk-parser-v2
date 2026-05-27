import { config } from './config.js';
import { launchBrowser } from './browser.js';
import { openCommunities, searchCommunities, waitForSearchResults, clickFirstCommunity } from './steps/communities.js';
import { parseCommunityPage } from './steps/communityPage.js';
import { waitForEnter } from './utils/prompt.js';
import { saveCommunityToJson } from './export/toJson.js';

function ensureQuery() {
  if (!config.query?.trim()) {
    console.error('Укажите поисковый запрос: npm start -- --query "ваш запрос"');
    process.exit(1);
  }
}

async function main() {
  ensureQuery();

  const browser = await launchBrowser();
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());

  console.log(`Открываю страницу входа: ${config.loginUrl}`);
  await page.goto(config.loginUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  console.log('\nВойдите в аккаунт VK в браузере.');
  await waitForEnter('Когда войдёте — нажмите Enter в этой консоли...\n');

  await openCommunities(page);
  await searchCommunities(page, config.query.trim());
  await waitForSearchResults(page);
  await clickFirstCommunity(page);
  const communityData = await parseCommunityPage(page);

  const savedPath = await saveCommunityToJson(communityData, config.query.trim());

  console.log(`JSON сохранён: ${savedPath}`);

  console.log('\nГотово. Браузер остаётся открытым — закройте его или нажмите Ctrl+C.');
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
