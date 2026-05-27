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
import { createResultsJsonWriter } from './export/toJson.js';

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

  const communities = [];
  const jsonWriter = createResultsJsonWriter(config.query.trim());
  let savedPath = null;

  for (let index = 0; index < config.limit; index += 1) {
    const availableResults = await ensureResultsLoaded(page, index + 1);

    if (!availableResults.found || index >= availableResults.count) {
      console.log(
        `\nВ списке ${availableResults.count} сообществ, запланировано ${config.limit}. `
        + `Обработано ${communities.length}. Завершаю парсинг.`,
      );
      break;
    }

    console.log(`\n=== Сообщество ${index + 1} из ${config.limit} ===`);

    await clickCommunityByIndex(page, index);
    communities.push(await parseCommunityPage(page));
    savedPath = await jsonWriter.save(communities);
    console.log(`JSON обновлён: ${savedPath} (${communities.length})`);

    if (index < config.limit - 1) {
      await goBackToSearchResults(page);
    }
  }

  if (communities.length === 0) {
    console.log('\nНет данных для сохранения. Завершаю работу.');
    return;
  }

  console.log(`\nИтоговый JSON: ${savedPath}`);
  console.log('\nГотово. Браузер остаётся открытым — закройте его или нажмите Ctrl+C.');
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
