import { config } from './config.js';
import { launchBrowser } from './browser.js';
import {
  openCommunities,
  searchCommunities,
  waitForSearchResults,
  goBackToSearchResults,
  clickCommunityByIndex,
  ensureResultsLoaded,
} from './steps/communities.js';
import { parseCommunityPage } from './steps/communityPage.js';
import { waitForEnter } from './utils/prompt.js';
import { createSupabaseExporter, verifySupabase } from './export/toSupabase.js';

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

  console.log(`Запланировано групп: ${config.limit}`);

  const searchQuery = config.query.trim();
  const supabaseExporter = createSupabaseExporter(searchQuery);
  let processedCount = 0;

  for (let index = 0; index < config.limit; index += 1) {
    const availableResults = await ensureResultsLoaded(page, index + 1);

    if (!availableResults.found || index >= availableResults.count) {
      console.log(
        `\nВ списке ${availableResults.count} сообществ, запланировано ${config.limit}. `
        + `Обработано ${processedCount}. Завершаю парсинг.`,
      );
      break;
    }

    console.log(`\n=== Сообщество ${index + 1} из ${config.limit} ===`);

    await clickCommunityByIndex(page, index);
    const community = await parseCommunityPage(page);

    const communityId = await supabaseExporter.saveCommunity(community);
    processedCount += 1;
    console.log(`Supabase: сохранено community_id=${communityId} (${processedCount})`);

    if (index < config.limit - 1) {
      await goBackToSearchResults(page);
    }
  }

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
