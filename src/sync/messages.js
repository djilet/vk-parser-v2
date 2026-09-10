import { config } from '../config.js';
import { getAccessToken } from '../vk/tokenStore.js';
import { getHistory, VkApiError, AUTH_FAILED_CODE } from '../vk/api.js';
import { mapMessageToUploadRow } from '../vk/mapMessage.js';
import { fetchSyncState, uploadMessages } from '../api/salesMessages.js';
import { iterateMessagesSent } from '../api/salesCommunityMessagesSent.js';

const HISTORY_PAGE_SIZE = 200; // максимум, который отдаёт messages.getHistory за один вызов
const UPLOAD_CHUNK_SIZE = 500; // лимит на items одного /messages/upload (как и у остальных батчей бэкенда)
const MAX_MESSAGES_PER_COMMUNITY = 10_000; // страховка от аномально длинной истории/бага пагинации

/** Заливает накопленные строки, разбивая на куски по UPLOAD_CHUNK_SIZE. Возвращает inserted. */
async function flush(communityId, rows) {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += UPLOAD_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPLOAD_CHUNK_SIZE);
    const result = await uploadMessages(communityId, chunk);
    inserted += result.inserted;
  }

  return inserted;
}

/**
 * Качает историю одного диалога и заливает её в базу.
 *
 * sinceVkMessageId — водяной знак: если задан, обход останавливается, как только встречено
 * сообщение с id <= водяного знака (всё это уже когда-то залито). Если null — качаем весь диалог.
 *
 * Страницы после первой берём курсором start_cmid (conversation_message_id), а не offset:
 * на длинной истории offset у VK ненадёжен. VK требует offset<=0, когда start_cmid задан,
 * поэтому offset всегда 0, а не «следующая» страница — start_cmid сам сдвигает окно.
 *
 * Заливка идёт по ходу постраничного обхода, а не одним разом в конце: обрыв на середине
 * длинного диалога (сеть, истёкший токен) не должен терять уже скачанные страницы.
 */
async function syncOne({ accessToken, communityId, peerId, sinceVkMessageId }) {
  let startCmid;
  let previousStartCmid;
  const rows = [];
  let fetchedTotal = 0;
  let droppedTotal = 0;
  let insertedTotal = 0;
  let reachedWatermark = false;

  for (;;) {
    const page = await getHistory(accessToken, peerId, HISTORY_PAGE_SIZE, 0, startCmid);

    if (!page.items || page.items.length === 0) {
      break;
    }

    for (const message of page.items) {
      if (sinceVkMessageId != null && message.id <= sinceVkMessageId) {
        reachedWatermark = true;
        break;
      }

      fetchedTotal += 1;

      // Служебные сообщения (приглашение в чат, смена фото/названия) и сообщения без текста
      // и вложений (включая нераспознанные типы) — писать нечего, но считаем их отдельно,
      // чтобы «просмотрено N, но добавлено 0» не выглядело подозрительно молча.
      const row = mapMessageToUploadRow(message);
      if (!row) {
        droppedTotal += 1;
        continue;
      }

      rows.push(row);
    }

    if (rows.length > 0) {
      insertedTotal += await flush(communityId, rows);
      rows.length = 0;
    }

    if (reachedWatermark || page.items.length < HISTORY_PAGE_SIZE || fetchedTotal >= MAX_MESSAGES_PER_COMMUNITY) {
      break;
    }

    previousStartCmid = startCmid;
    startCmid = page.items[page.items.length - 1].conversation_message_id;

    // Страховка от зависания: курсор обязан двигаться назад по истории на каждой странице.
    if (previousStartCmid != null && !(startCmid < previousStartCmid)) {
      break;
    }
  }

  return { fetched: fetchedTotal, dropped: droppedTotal, inserted: insertedTotal };
}

/** community_id -> peer_id (= chat_id в журнале отправок), одним проходом по журналу. */
async function loadCommunitiesFromSentLog() {
  const communities = new Map();

  for await (const sent of iterateMessagesSent()) {
    if (sent.community_id != null) {
      communities.set(sent.community_id, sent.chat_id);
    }
  }

  return communities;
}

/**
 * Прогоняет сообщества по одному, не давая обычной ошибке на одном остановить весь прогон.
 * Исключение — истёкший/невалидный токен (VkApiError code 5): дальше всё равно ничего не
 * скачается, поэтому прогон останавливается целиком с понятной подсказкой.
 */
async function runOverCommunities(communities, { limit } = {}) {
  const accessToken = await getAccessToken(config.vk.browserId);
  const total = limit ? Math.min(limit, communities.length) : communities.length;

  let processed = 0;
  let inserted = 0;
  let dropped = 0;
  let failed = 0;

  for (const community of communities) {
    if (limit && processed >= limit) {
      break;
    }

    processed += 1;

    try {
      const result = await syncOne({ accessToken, ...community });
      inserted += result.inserted;
      dropped += result.dropped;
      console.log(
        `[${processed}/${total}] community_id=${community.communityId} — новых сообщений: ${result.inserted}`
        + ` (просмотрено: ${result.fetched}, без текста/вложений: ${result.dropped})`
      );
    } catch (err) {
      if (err instanceof VkApiError && err.code === AUTH_FAILED_CODE) {
        throw new Error(
          `Токен VK истёк или недействителен — запустите npm run vk-token и повторите. `
          + `Остановлено на сообществе ${processed}/${total} (community_id=${community.communityId}).`
        );
      }

      failed += 1;
      console.error(`[${processed}/${total}] community_id=${community.communityId} — ошибка: ${err.message}`);
    }
  }

  return { processed, inserted, dropped, failed };
}

/**
 * Список сообществ для обхода: источник — журнал отправок (sales_community_messages_sent),
 * там уже есть и community_id, и chat_id = peer_id для каждого, кому мы писали.
 * withWatermarks=true подмешивает водяные знаки из /messages/sync-state — сообщества без
 * единого сохранённого сообщения получают sinceVkMessageId=null и при этом не пропускаются
 * (в отличие от обхода только по sync-state, который такие сообщества вообще не видит).
 */
async function buildCommunityList({ withWatermarks }) {
  const [communities, watermarkByCommunity] = await Promise.all([
    loadCommunitiesFromSentLog(),
    withWatermarks
      ? fetchSyncState().then(({ items }) => new Map(items.map((row) => [row.community_id, row.last_vk_message_id])))
      : Promise.resolve(new Map()),
  ]);

  return Array.from(communities, ([communityId, peerId]) => ({
    communityId,
    peerId,
    sinceVkMessageId: watermarkByCommunity.get(communityId) ?? null,
  }));
}

/**
 * Полная первичная заливка: качаем весь диалог целиком для каждого сообщества из журнала
 * отправок, независимо от того, что уже сохранено (watermark игнорируется).
 * onlyCommunityId — для `--full --community <id>`: та же логика полной заливки, но на одно
 * сообщество, а не на все сразу.
 */
export async function uploadAllCommunityMessages({ limit, onlyCommunityId } = {}) {
  let communities = await buildCommunityList({ withWatermarks: false });

  if (onlyCommunityId != null) {
    communities = communities.filter((c) => c.communityId === onlyCommunityId);

    if (communities.length === 0) {
      throw new Error(
        `Для сообщества ${onlyCommunityId} нет записи в журнале отправок — не знаю peer_id для messages.getHistory`
      );
    }
  }

  return runOverCommunities(communities, { limit });
}

/**
 * До-синхронизация: для каждого сообщества из журнала отправок тянем только то, что новее
 * сохранённого водяного знака (а для сообществ без единого сообщения — весь диалог).
 */
export async function syncNewMessages({ limit } = {}) {
  const communities = await buildCommunityList({ withWatermarks: true });

  return runOverCommunities(communities, { limit });
}

/** Синхронизация одного сообщества — только новые сообщения после текущего водяного знака. */
export async function syncCommunityMessages(communityId) {
  const communities = await buildCommunityList({ withWatermarks: true });
  const community = communities.find((c) => c.communityId === communityId);

  if (!community) {
    throw new Error(
      `Для сообщества ${communityId} нет записи в журнале отправок — не знаю peer_id для messages.getHistory`
    );
  }

  return runOverCommunities([community], { limit: 1 });
}
