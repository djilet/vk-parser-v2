import { config } from './config.js';
import { launchBrowser } from './browser.js';
import {
  openCommunities,
  searchCommunities,
  waitForSearchResults,
} from './steps/communities.js';
import { waitForEnter } from './utils/prompt.js';
import { verifyApi } from './export/toApi.js';
import { runCommunityParser } from './parser/communityParser.js';

function ensureConfig() {
  const example = 'npm start -- --query "Футбольные турниры" --limit 3';

  if (!config.query?.trim()) {
    console.error(`Укажите параметры запуска: ${example}`);
    process.exit(1);
  }

  if (!config.limit) {
    console.error(`Укажите параметры запуска: ${example}`);
    process.exit(1);
  }
}

async function main() {
  ensureConfig();
  await verifyApi();
  console.log('API: подключение проверено');

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

  const searchResults = await waitForSearchResults(page);

  if (searchResults.count === 0) {
    console.log('\nВ списке нет сообществ. Завершаю работу.');
    return;
  }

  console.log(`Запланировано групп: ${config.limit}`);

  const searchQuery = config.query.trim();
  const processedCount = await runCommunityParser(page, {
    searchQuery,
    limit: config.limit,
    skip: 0,
  });

  if (processedCount === 0) {
    console.log('\nНет данных для сохранения. Завершаю работу.');
    return;
  }

  console.log(`\nГотово. Сохранено через API: ${processedCount}`);
  console.log('\nБраузер остаётся открытым — закройте его или нажмите Ctrl+C.');
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
