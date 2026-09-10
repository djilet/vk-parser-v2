import { config } from './config.js';
import { verifyApi } from './export/toApi.js';
import { isApiConfigured } from './api/auth.js';
import { getCommunity, iterateUncheckedCommunities, updateCommunity } from './api/salesCommunities.js';
import { classifyCommunities } from './llm/classifyCommunity.js';
import { ensureYandexConfigured } from './llm/yandexGpt.js';
import { sleep } from './utils/sleep.js';

const BATCH_SIZE = 25; // сообществ на один запрос к LLM — экономит вызовы Yandex GPT
const LLM_DELAY_MS = 400; // пауза между батчами, чтобы не ловить 429

function ensureConfig() {
  if (!isApiConfigured()) {
    console.error('API не настроен: задайте API_BASE_URL, API_PHONE и API_CODE в .env');
    process.exit(1);
  }

  try {
    ensureYandexConfigured();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  ensureConfig();
  await verifyApi();
  console.log('API: подключение проверено');

  console.log('Собираю список непроверенных сообществ (is_fraud IS NULL)...');
  const ids = [];
  for await (const community of iterateUncheckedCommunities()) {
    ids.push(community.id);
    if (config.limit && ids.length >= config.limit) {
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

    let cards;
    try {
      cards = await Promise.all(batchIds.map((id) => getCommunity(id)));
    } catch (err) {
      failed += batchIds.length;
      processed += batchIds.length;
      console.error(`${batchPrefix} Ошибка загрузки карточек: ${err.message}`);
      continue;
    }

    let results;
    let rawResponse;
    try {
      ({ results, rawResponse } = await classifyCommunities(cards));
    } catch (err) {
      failed += cards.length;
      processed += cards.length;
      console.error(`${batchPrefix} Ошибка запроса к LLM: ${err.message}`);
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
        await updateCommunity(card.id, { is_fraud: !result.isOrganizer });
      } catch (err) {
        failed += 1;
        console.error(`${batchPrefix} Ошибка на community_id=${card.id}: ${err.message}`);
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

  console.log(
    `\nГотово. Организаторов: ${organizers}, не организаторов: ${notOrganizers}, `
    + `не решено: ${unknown}, ошибок: ${failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
