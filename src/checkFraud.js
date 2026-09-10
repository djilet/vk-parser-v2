import { config } from './config.js';
import { verifyApi } from './export/toApi.js';
import { isApiConfigured } from './api/auth.js';
import { getCommunity, iterateUncheckedCommunities, updateCommunity } from './api/salesCommunities.js';
import { classifyCommunity } from './llm/classifyCommunity.js';
import { ensureYandexConfigured } from './llm/yandexGpt.js';
import { sleep } from './utils/sleep.js';

const LLM_DELAY_MS = 400; // пауза между вызовами LLM, чтобы не ловить 429

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

  let organizers = 0;
  let notOrganizers = 0;
  let unknown = 0;
  let failed = 0;

  for (const [index, id] of ids.entries()) {
    const prefix = `[${index + 1}/${ids.length}]`;

    try {
      const card = await getCommunity(id);
      const { isOrganizer, raw } = await classifyCommunity(card);

      if (isOrganizer === null) {
        unknown += 1;
        console.log(`${prefix} ${card.name ?? card.url} → не удалось разобрать ответ LLM: "${raw}"`);
        continue;
      }

      await updateCommunity(id, { is_fraud: !isOrganizer });

      if (isOrganizer) {
        organizers += 1;
        console.log(`${prefix} ${card.name ?? card.url} → организатор`);
      } else {
        notOrganizers += 1;
        console.log(`${prefix} ${card.name ?? card.url} → не организатор`);
      }
    } catch (err) {
      failed += 1;
      console.error(`${prefix} Ошибка на community_id=${id}: ${err.message}`);
    }

    if (index < ids.length - 1) {
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
