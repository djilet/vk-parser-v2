import { parseBrowserId, sleep, type BrowserId, type EnvConfig } from '@vk-sales-bot/core';
import { createSalesApiClient } from '@vk-sales-bot/sales-api';
import { keepOpenOrClose, openLoggedInPage, parseCommunityDescription, verifyApi } from '@vk-sales-bot/parser';

const PAGE_SETTLE_MS = 2_000; // пауза после открытия страницы сообщества
const MAX_MISS_STREAK = 15; // столько подряд «страница не отдала интерфейс» = нас блокируют

export type ParseDescriptionsOptions = {
  offset?: number;
  limit?: number;
  browser?: string;
  keepOpen?: boolean;
};

export async function runParseDescriptionsCommand(env: EnvConfig, options: ParseDescriptionsOptions): Promise<void> {
  const browserId: BrowserId = parseBrowserId(options.browser);
  const api = createSalesApiClient(env.api);

  await verifyApi(api);
  console.log('API: подключение проверено');

  const offset = options.offset ?? 0;
  const maxIds = options.limit ? offset + options.limit : null;

  console.log('Собираю список сообществ...');
  const ids: number[] = [];
  for await (const community of api.http.iterate<{ id: number }>('/admin/sales/communities', {})) {
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

  const { launched, page } = await openLoggedInPage(browserId, env);

  let updated = 0;
  let empty = 0;
  let skipped = 0;
  let failed = 0;
  let missStreak = 0;
  let blockedAt: number | null = null;

  for (const [index, id] of worklist.entries()) {
    const position = offset + index; // абсолютный индекс в списке

    try {
      const card = await api.communities.getCommunity(id);

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

      await api.communities.updateCommunity(id, { description });
      updated += 1;
      console.log(`Обновлено: ${description}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка на community_id=${id}: ${message}`);
    }
  }

  console.log(`\nГотово. Обновлено: ${updated}, без описания: ${empty}, уже было: ${skipped}, ошибок: ${failed}`);

  if (blockedAt != null) {
    console.log(`\nПохоже, VK блокирует парсер: ${MAX_MISS_STREAK} страниц подряд без интерфейса.`);
    console.log(`Продолжить позже: vk-sales-bot parse-descriptions --offset ${blockedAt}`);
  }

  await keepOpenOrClose(launched, options.keepOpen ?? false);
}
