import { config } from './config.js';
import { launchBrowser } from './browser.js';
import {
  openCommunities,
  searchCommunities,
  waitForSearchResults,
} from './steps/communities.js';
import { waitForEnter } from './utils/prompt.js';
import { verifySupabase } from './export/toSupabase.js';
import { runCommunityParser } from './parser/communityParser.js';

function ensureConfig() {
  const example = 'npm run parse-skip -- --query "Футзал турниры" --limit 10 --skip 27';

  if (!config.query?.trim()) {
    console.error(`Укажите параметры запуска: ${example}`);
    process.exit(1);
  }

  if (!config.limit) {
    console.error(`Укажите параметры запуска: ${example}`);
    process.exit(1);
  }

  if (config.skip == null) {
    console.error(`Укажите --skip: ${example}`);
    process.exit(1);
  }
}

async function main() {
  ensureConfig();
  await verifySupabase();
  console.log('Supabase: подключение проверено');

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

  if (config.skip >= searchResults.count) {
    console.log(
      `\nВ списке ${searchResults.count} сообществ, а --skip=${config.skip}. `
      + 'Нечего парсить. Завершаю работу.',
    );
    return;
  }

  console.log(`Пропуск: ${config.skip}, запланировано групп: ${config.limit}`);

  const searchQuery = config.query.trim();
  const processedCount = await runCommunityParser(page, {
    searchQuery,
    limit: config.limit,
    skip: config.skip,
  });

  if (processedCount === 0) {
    console.log('\nНет данных для сохранения. Завершаю работу.');
    return;
  }

  console.log(`\nГотово. Сохранено в Supabase: ${processedCount}`);
  console.log('\nБраузер остаётся открытым — закройте его или нажмите Ctrl+C.');
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
