import { config } from './config.js';
import { launchBrowser } from './browser.js';
import { verifyApi } from './export/toApi.js';
import { isApiConfigured } from './api/auth.js';
import { apiIterate } from './api/client.js';
import { COMMUNITIES_PATH, getCommunity, updateCommunity } from './api/salesCommunities.js';
import { parseCommunityDescription } from './steps/communityDescription.js';
import { waitForEnter } from './utils/prompt.js';
import { sleep } from './utils/sleep.js';

const PAGE_SETTLE_MS = 2_000; // пауза после открытия страницы сообщества
const MAX_MISS_STREAK = 15; // столько подряд «страница не отдала интерфейс» = нас блокируют

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

  const offset = config.offset ?? 0;
  const maxIds = config.limit ? offset + config.limit : null;

  console.log('Собираю список сообществ...');
  const ids = [];
  for await (const community of apiIterate(COMMUNITIES_PATH, {})) {
    ids.push(community.id);
    if (maxIds && ids.length >= maxIds) {
      break;
    }
  }

  const worklist = ids.slice(offset);
  console.log(`Сообществ в списке: ${ids.length}, в работе: ${worklist.length} (offset: ${offset})`);

  if (worklist.length === 0) {
    console.log('Нечего обрабатывать. Завершаю работу.');
    return;
  }

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
  let missStreak = 0;
  let blockedAt = null;

  for (const [index, id] of worklist.entries()) {
    const position = offset + index; // абсолютный индекс в списке

    try {
      const card = await getCommunity(id);

      if (card.description?.trim()) {
        skipped += 1;
        continue;
      }

      console.log(`\n=== ${position + 1} из ${ids.length}: ${card.name ?? card.url} ===`);
      await page.goto(card.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await sleep(PAGE_SETTLE_MS);

      const { description, reason } = await parseCommunityDescription(page);

      if (reason === 'no_button' || reason === 'no_modal') {
        missStreak += 1;
        empty += 1;
        console.log(`Страница не отдала интерфейс (${reason}), подряд: ${missStreak}`);

        if (missStreak >= MAX_MISS_STREAK) {
          blockedAt = position - (MAX_MISS_STREAK - 1); // начало серии — её стоит перепройти
          break;
        }

        continue;
      }

      missStreak = 0; // страница жива — серия прервана

      if (!description) {
        empty += 1;
        console.log('Описание пустое');
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

  if (blockedAt != null) {
    console.log(`\nПохоже, VK блокирует парсер: ${MAX_MISS_STREAK} страниц подряд без интерфейса.`);
    console.log(`Продолжить позже: npm run parse-descriptions -- --offset ${blockedAt}`);
  }

  console.log('Браузер остаётся открытым — закройте его или нажмите Ctrl+C.');
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
