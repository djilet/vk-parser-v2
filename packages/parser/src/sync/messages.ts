import { AUTH_FAILED_CODE, VkApiError, type VkClient } from '@vk-sales-bot/core';
import type { SalesApiClient } from '@vk-sales-bot/sales-api';
import { mapMessageToUploadRow } from '../vk/map-message.js';

const HISTORY_PAGE_SIZE = 200; // максимум, который отдаёт messages.getHistory за один вызов
const UPLOAD_CHUNK_SIZE = 500; // лимит на items одного /messages/upload (как и у остальных батчей бэкенда)
const MAX_MESSAGES_PER_COMMUNITY = 10_000; // страховка от аномально длинной истории/бага пагинации
const CONVERSATIONS_PAGE_SIZE = 200; // максимум, который отдаёт messages.getConversations за один вызов

export type SyncCommunityRef = { communityId: number; peerId: number; sinceVkMessageId: number | null };
export type SyncResult = { processed: number; inserted: number; dropped: number; failed: number };
export type SyncOneResult = { fetched: number; dropped: number; inserted: number };

/** Заливает накопленные строки, разбивая на куски по UPLOAD_CHUNK_SIZE. Возвращает inserted. */
async function flush(
  api: SalesApiClient,
  communityId: number,
  rows: ReturnType<typeof mapMessageToUploadRow>[],
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += UPLOAD_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPLOAD_CHUNK_SIZE).filter((row): row is NonNullable<typeof row> => row != null);
    const result = await api.messages.uploadMessages(communityId, chunk);
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
 * Страницы после первой берём курсором start_cmid (conversation_message_id), а не offset: на
 * длинной истории offset у VK ненадёжен. VK требует offset<=0, когда start_cmid задан, поэтому
 * offset всегда 0, а не «следующая» страница — start_cmid сам сдвигает окно.
 *
 * Заливка идёт по ходу постраничного обхода, а не одним разом в конце: обрыв на середине
 * длинного диалога (сеть, истёкший токен) не должен терять уже скачанные страницы.
 */
async function syncOne(
  vk: VkClient,
  api: SalesApiClient,
  { communityId, peerId, sinceVkMessageId }: SyncCommunityRef,
): Promise<SyncOneResult> {
  let startCmid: number | undefined;
  let previousStartCmid: number | undefined;
  let rows: ReturnType<typeof mapMessageToUploadRow>[] = [];
  let fetchedTotal = 0;
  let droppedTotal = 0;
  let insertedTotal = 0;
  let reachedWatermark = false;

  for (;;) {
    const page = await vk.getHistory(peerId, HISTORY_PAGE_SIZE, 0, { startCmid, extended: false });

    if (!page.items || page.items.length === 0) {
      break;
    }

    for (const message of page.items) {
      if (sinceVkMessageId != null && message.id <= sinceVkMessageId) {
        reachedWatermark = true;
        break;
      }

      fetchedTotal += 1;

      // Служебные сообщения (приглашение в чат, смена фото/названия) и сообщения без текста и
      // вложений (включая нераспознанные типы) — писать нечего, но считаем их отдельно, чтобы
      // «просмотрено N, но добавлено 0» не выглядело подозрительно молча.
      const row = mapMessageToUploadRow(message);
      if (!row) {
        droppedTotal += 1;
        continue;
      }

      rows.push(row);
    }

    if (rows.length > 0) {
      insertedTotal += await flush(api, communityId, rows);
      rows = [];
    }

    if (reachedWatermark || page.items.length < HISTORY_PAGE_SIZE || fetchedTotal >= MAX_MESSAGES_PER_COMMUNITY) {
      break;
    }

    previousStartCmid = startCmid;
    startCmid = page.items[page.items.length - 1]!.conversation_message_id;

    // Страховка от зависания: курсор обязан двигаться назад по истории на каждой странице.
    if (previousStartCmid != null && !(startCmid < previousStartCmid)) {
      break;
    }
  }

  return { fetched: fetchedTotal, dropped: droppedTotal, inserted: insertedTotal };
}

/** community_id -> peer_id (= chat_id в журнале отправок), одним проходом по журналу. */
async function loadCommunitiesFromSentLog(api: SalesApiClient): Promise<Map<number, number>> {
  const communities = new Map<number, number>();

  for await (const sent of api.messagesSent.iterateMessagesSent()) {
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
async function runOverCommunities(
  vk: VkClient,
  api: SalesApiClient,
  communities: SyncCommunityRef[],
  { limit }: { limit?: number } = {},
): Promise<SyncResult> {
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
      const result = await syncOne(vk, api, community);
      inserted += result.inserted;
      dropped += result.dropped;
      console.log(
        `[${processed}/${total}] community_id=${community.communityId} — новых сообщений: ${result.inserted}` +
          ` (просмотрено: ${result.fetched}, без текста/вложений: ${result.dropped})`,
      );
    } catch (error) {
      if (error instanceof VkApiError && error.code === AUTH_FAILED_CODE) {
        throw new Error(
          `Токен VK истёк или недействителен — запустите vk-sales-bot vk token и повторите. ` +
            `Остановлено на сообществе ${processed}/${total} (community_id=${community.communityId}).`,
        );
      }

      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${processed}/${total}] community_id=${community.communityId} — ошибка: ${message}`);
    }
  }

  return { processed, inserted, dropped, failed };
}

/**
 * Список сообществ для обхода: источник — журнал отправок (sales_community_messages_sent), там
 * уже есть и community_id, и chat_id = peer_id для каждого, кому мы писали. withWatermarks=true
 * подмешивает водяные знаки из /messages/sync-state — сообщества без единого сохранённого
 * сообщения получают sinceVkMessageId=null и при этом не пропускаются.
 */
async function buildCommunityList(
  api: SalesApiClient,
  { withWatermarks }: { withWatermarks: boolean },
): Promise<SyncCommunityRef[]> {
  const [communities, watermarkByCommunity] = await Promise.all([
    loadCommunitiesFromSentLog(api),
    withWatermarks
      ? api.messages
          .fetchSyncState()
          .then(({ items }) => new Map(items.map((row) => [row.community_id, row.last_vk_message_id])))
      : Promise.resolve(new Map<number, number | null>()),
  ]);

  return Array.from(communities, ([communityId, peerId]) => ({
    communityId,
    peerId,
    sinceVkMessageId: watermarkByCommunity.get(communityId) ?? null,
  }));
}

/**
 * У бэкенда нет отдельной сущности для диалога с человеком (только communities), поэтому для
 * peer.type === 'user' карточка сообщества исполняет роль карточки контакта: создаём её на лету
 * по данным users.get, если такой карточки для этого peer_id ещё нет.
 */
async function ensurePersonCommunity(vk: VkClient, api: SalesApiClient, peerId: number): Promise<number | null> {
  const existing = await api.communities.findCommunityByPeerId(peerId);
  if (existing) {
    return existing.id;
  }

  const [user] = await vk.getUsers([peerId], 'screen_name');
  if (!user) {
    console.log(`Диалог с peer_id=${peerId} пропущен — users.get не вернул пользователя`);
    return null;
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
  const payload = {
    url: `https://vk.com/${(user.screen_name as string | undefined) ?? `id${peerId}`}`,
    name: name ?? undefined,
    msg_url: `https://vk.com/im/convo/${peerId}`,
    peer_id: peerId,
  };

  try {
    const created = await api.communities.createCommunity(payload);
    console.log(`Создана карточка для «${name ?? payload.url}» (id=${created.id})`);
    return created.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Не удалось создать карточку для peer_id=${peerId}: ${message}`);
    return null;
  }
}

/**
 * Список всех переписок аккаунта — с сообществами и с людьми — постранично через
 * messages.getConversations. В отличие от buildCommunityList, не зависит от журнала отправок
 * и находит переписки, в которые скрипт ещё никогда не писал.
 *
 * peer.type === 'group' — диалог с сообществом: его peer.id — тот же peer_id, что бэкенд хранит
 * в карточке сообщества (communities.peer_id), поэтому community_id резолвится через
 * findCommunityByPeerId, а не вычисляется из VK id (это разные id); сообщества без карточки на
 * бэкенде пропускаются, а не создаются — карточку сообщества скрипт сам не заводит.
 *
 * peer.type === 'user' — диалог с человеком, не с сообществом: карточки для него на бэкенде
 * никогда не будет сама по себе, поэтому она создаётся автоматически (см. ensurePersonCommunity).
 */
async function loadCommunityConversationPeers(
  vk: VkClient,
  api: SalesApiClient,
  { withWatermarks }: { withWatermarks: boolean },
): Promise<SyncCommunityRef[]> {
  const groupPeers: number[] = [];
  const userPeers: number[] = [];
  let offset = 0;

  for (;;) {
    const page = await vk.getConversations(CONVERSATIONS_PAGE_SIZE, offset, 'all', { extended: false });
    const items = page.items ?? [];

    if (items.length === 0) {
      break;
    }

    for (const item of items) {
      const peer = item.conversation?.peer;
      if (peer?.type === 'group') {
        groupPeers.push(peer.id);
      } else if (peer?.type === 'user') {
        userPeers.push(peer.id);
      }
    }

    if (items.length < CONVERSATIONS_PAGE_SIZE) {
      break;
    }

    offset += items.length;
  }

  const watermarkByCommunity = withWatermarks
    ? await api.messages
        .fetchSyncState()
        .then(({ items }) => new Map(items.map((row) => [row.community_id, row.last_vk_message_id])))
    : new Map<number, number | null>();

  const communities: SyncCommunityRef[] = [];

  for (const peerId of groupPeers) {
    const community = await api.communities.findCommunityByPeerId(peerId);

    if (!community) {
      console.log(`Переписка с peer_id=${peerId} пропущена — нет карточки сообщества на бэкенде`);
      continue;
    }

    communities.push({
      communityId: community.id,
      peerId,
      sinceVkMessageId: watermarkByCommunity.get(community.id) ?? null,
    });
  }

  for (const peerId of userPeers) {
    const communityId = await ensurePersonCommunity(vk, api, peerId);

    if (communityId != null) {
      communities.push({ communityId, peerId, sinceVkMessageId: watermarkByCommunity.get(communityId) ?? null });
    }
  }

  return communities;
}

/**
 * Полная заливка по всем перепискам аккаунта — с сообществами и с людьми, а не только по тем,
 * что уже попали в журнал отправок. Водяные знаки игнорируются: качается вся история каждого
 * диалога заново. Для `--all-conversations --full`.
 */
export async function uploadAllAccountConversations(
  vk: VkClient,
  api: SalesApiClient,
  { limit }: { limit?: number } = {},
): Promise<SyncResult> {
  const communities = await loadCommunityConversationPeers(vk, api, { withWatermarks: false });
  return runOverCommunities(vk, api, communities, { limit });
}

/**
 * До-синхронизация по всем перепискам аккаунта: как uploadAllAccountConversations, но с
 * водяными знаками — тянется только то, что новее уже залитого. Для `--all-conversations` без `--full`.
 */
export async function syncAllAccountConversations(
  vk: VkClient,
  api: SalesApiClient,
  { limit }: { limit?: number } = {},
): Promise<SyncResult> {
  const communities = await loadCommunityConversationPeers(vk, api, { withWatermarks: true });
  return runOverCommunities(vk, api, communities, { limit });
}

/**
 * Полная первичная заливка: качаем весь диалог целиком для каждого сообщества из журнала
 * отправок, независимо от того, что уже сохранено (watermark игнорируется).
 * onlyCommunityId — для `--full --community <id>`: та же логика полной заливки, но на одно
 * сообщество, а не на все сразу.
 */
export async function uploadAllCommunityMessages(
  vk: VkClient,
  api: SalesApiClient,
  { limit, onlyCommunityId }: { limit?: number; onlyCommunityId?: number } = {},
): Promise<SyncResult> {
  let communities = await buildCommunityList(api, { withWatermarks: false });

  if (onlyCommunityId != null) {
    communities = communities.filter((c) => c.communityId === onlyCommunityId);

    if (communities.length === 0) {
      throw new Error(
        `Для сообщества ${onlyCommunityId} нет записи в журнале отправок — не знаю peer_id для messages.getHistory`,
      );
    }
  }

  return runOverCommunities(vk, api, communities, { limit });
}

/**
 * До-синхронизация: для каждого сообщества из журнала отправок тянем только то, что новее
 * сохранённого водяного знака (а для сообществ без единого сообщения — весь диалог).
 */
export async function syncNewMessages(
  vk: VkClient,
  api: SalesApiClient,
  { limit }: { limit?: number } = {},
): Promise<SyncResult> {
  const communities = await buildCommunityList(api, { withWatermarks: true });
  return runOverCommunities(vk, api, communities, { limit });
}

/** Синхронизация одного сообщества — только новые сообщения после текущего водяного знака. */
export async function syncCommunityMessages(vk: VkClient, api: SalesApiClient, communityId: number): Promise<SyncResult> {
  const communities = await buildCommunityList(api, { withWatermarks: true });
  const community = communities.find((c) => c.communityId === communityId);

  if (!community) {
    throw new Error(
      `Для сообщества ${communityId} нет записи в журнале отправок — не знаю peer_id для messages.getHistory`,
    );
  }

  return runOverCommunities(vk, api, [community], { limit: 1 });
}
