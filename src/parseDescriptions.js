import { config } from './config.js';
import { launchBrowser } from './browser.js';
import { verifyApi } from './export/toApi.js';
import { isApiConfigured } from './api/auth.js';
import { apiIterate } from './api/client.js';
import { COMMUNITIES_PATH, getCommunity, updateCommunity } from './api/salesCommunities.js';
import { parseCommunityDescription } from './steps/communityDescription.js';
import { waitForEnter } from './utils/prompt.js';
import { sleep } from './utils/sleep.js';

const PAGE_LOAD_WAIT_MS = 5_000; // как в steps/communityPage.js

function ensureConfig() {
  if (!isApiConfigured()) {
    console.error('API не настроен: задайте API_BASE_URL, API_PHONE и API_CODE в .env');
    process.exit(1);
  }
}

async function main() {
  ensureConfig();
  await verifyApi();
  console.log('API: подключение проверено');

  console.log('Собираю список сообществ...');
  const ids = [];
  for await (const community of apiIterate(COMMUNITIES_PATH, {})) {
    ids.push(community.id);
    if (config.limit && ids.length >= config.limit) {
      break;
    }
  }
  console.log(`Сообществ в работе: ${ids.length}`);

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

  let updated = 0;
  let empty = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, id] of ids.entries()) {
    try {
      const card = await getCommunity(id);

      if (card.description?.trim()) {
        skipped += 1;
        continue;
      }

      console.log(`\n=== ${index + 1} из ${ids.length}: ${card.name ?? card.url} ===`);
      await page.goto(card.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await sleep(PAGE_LOAD_WAIT_MS);

      const description = await parseCommunityDescription(page);

      if (!description) {
        empty += 1;
        console.log('Описание не найдено, пропускаю');
        continue;
      }

      await updateCommunity(id, { description });
      updated += 1;
      console.log(`Обновлено: ${description}`);
    } catch (err) {
      failed += 1;
      console.error(`Ошибка на community_id=${id}: ${err.message}`);
    }
  }

  console.log(
    `\nГотово. Обновлено: ${updated}, без описания: ${empty}, уже было: ${skipped}, ошибок: ${failed}`,
  );
  console.log('Браузер остаётся открытым — закройте его или нажмите Ctrl+C.');
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
