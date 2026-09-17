import { sleep, type EnvConfig } from '@vk-sales-bot/core';
import { createSalesApiClient, type SalesCommunity } from '@vk-sales-bot/sales-api';
import { classifyCommunities, ensureYandexConfigured, verifyApi } from '@vk-sales-bot/parser';

const BATCH_SIZE = 25; // сообществ на один запрос к LLM — экономит вызовы Yandex GPT
const LLM_DELAY_MS = 400; // пауза между батчами, чтобы не ловить 429

export type CheckFraudOptions = { limit?: number };

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function runCheckFraudCommand(env: EnvConfig, options: CheckFraudOptions): Promise<void> {
  const api = createSalesApiClient(env.api);
  ensureYandexConfigured(env);
  await verifyApi(api);
  console.log('API: подключение проверено');

  console.log('Собираю список непроверенных сообществ (is_fraud IS NULL)...');
  const ids: number[] = [];
  for await (const community of api.communities.iterateUncheckedCommunities()) {
    ids.push(community.id);
    if (options.limit && ids.length >= options.limit) {
      break;
    }
  }
  console.log(`Сообществ в работе: ${ids.length}`);

  const batches = chunk(ids, BATCH_SIZE);

  let organizers = 0;
  let notOrganizers = 0;
  let unknown = 0;
  let failed = 0;
  let processed = 0;

  for (const [batchIndex, batchIds] of batches.entries()) {
    const batchPrefix = `[батч ${batchIndex + 1}/${batches.length}]`;

    let cards: SalesCommunity[];
    try {
      cards = await Promise.all(batchIds.map((id) => api.communities.getCommunity(id)));
    } catch (error) {
      failed += batchIds.length;
      processed += batchIds.length;
      console.error(`${batchPrefix} Ошибка загрузки карточек: ${error instanceof Error ? error.message : error}`);
      continue;
    }

    let results;
    let rawResponse;
    try {
      ({ results, rawResponse } = await classifyCommunities(env, cards));
    } catch (error) {
      failed += cards.length;
      processed += cards.length;
      console.error(`${batchPrefix} Ошибка запроса к LLM: ${error instanceof Error ? error.message : error}`);
      continue;
    }

    if (results.size < cards.length) {
      console.log(`${batchPrefix} Сырой ответ LLM (для отладки):\n${rawResponse}`);
    }

    for (const card of cards) {
      processed += 1;
      const result = results.get(card.id);

      if (!result) {
        unknown += 1;
        console.log(`${batchPrefix} [${processed}/${ids.length}] ${card.name ?? card.url} (id=${card.id}) → не удалось разобрать ответ LLM`);
        continue;
      }

      try {
        await api.communities.updateCommunity(card.id, { is_fraud: !result.isOrganizer });
      } catch (error) {
        failed += 1;
        console.error(`${batchPrefix} Ошибка на community_id=${card.id}: ${error instanceof Error ? error.message : error}`);
        continue;
      }

      if (result.isOrganizer) {
        organizers += 1;
        console.log(`${batchPrefix} [${processed}/${ids.length}] ${card.name ?? card.url} → организатор`);
      } else {
        notOrganizers += 1;
        console.log(`${batchPrefix} [${processed}/${ids.length}] ${card.name ?? card.url} → не организатор`);
      }
    }

    if (batchIndex < batches.length - 1) {
      await sleep(LLM_DELAY_MS);
    }
  }

  console.log(`\nГотово. Организаторов: ${organizers}, не организаторов: ${notOrganizers}, не решено: ${unknown}, ошибок: ${failed}`);
}
