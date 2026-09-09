import { config as loadEnv } from 'dotenv';
import { verifyApi } from './export/toApi.js';
import { fetchAllRows } from './supabase/client.js';
import {
  createCommunity,
  deleteCommunity,
  findCommunityByPeerId,
  findCommunityByUrl,
  updateCommunity,
} from './api/salesCommunities.js';
import {
  createCommunityContact,
  listCommunityContacts,
  updateCommunityContact,
} from './api/salesCommunityContacts.js';
import {
  createSearchQuery,
  findSearchQuery,
  updateSearchQuery,
} from './api/salesCommunitySearchQueries.js';
import {
  createMessageSent,
  findMessageSentByChatId,
} from './api/salesCommunityMessagesSent.js';

loadEnv();

/** Печатаем прогресс через каждые N обработанных строк — прогон на 800+ сообществ идёт долго. */
const PROGRESS_EVERY = 25;

/** Простая проверка формата — в Supabase встречаются мусорные значения вроде "см. описание". */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeEmail(email, { table, rowId }) {
  if (!email?.trim()) {
    return null;
  }

  if (!EMAIL_RE.test(email.trim())) {
    console.warn(`[${table}] id=${rowId} — невалидный email "${email}", сохраняю без него`);
    return null;
  }

  return email.trim();
}

function communityPayload(row) {
  return {
    url: row.url,
    name: row.name,
    phone: row.phone,
    site: row.site,
    msg_url: row.msg_url,
    peer_id: row.peer_id,
    last_post_date: row.last_post_date,
    is_fraud: row.is_frod,
    source: row.source,
    description: row.description,
  };
}

/**
 * Сообщество могло сменить url, сохранив peer_id — тогда в бэкенде может уже жить
 * запись с этим peer_id (под старым url). Переносим её на новый url, а не создаём дубль.
 */
async function reconcileCommunityByPeerId(payload) {
  if (payload.peer_id == null) {
    return null;
  }

  const byPeerId = await findCommunityByPeerId(payload.peer_id);
  if (!byPeerId) {
    return null;
  }

  const byUrl = await findCommunityByUrl(payload.url);
  if (byUrl && byUrl.id !== byPeerId.id) {
    await deleteCommunity(byUrl.id);
  }

  await updateCommunity(byPeerId.id, payload);

  return byPeerId.id;
}

async function upsertCommunity(payload) {
  const reconciled = await reconcileCommunityByPeerId(payload);
  if (reconciled != null) {
    return { id: reconciled, created: false };
  }

  const existing = await findCommunityByUrl(payload.url);
  if (existing) {
    await updateCommunity(existing.id, payload);
    return { id: existing.id, created: false };
  }

  const created = await createCommunity(payload);
  return { id: created.id, created: true };
}

async function migrateCommunities() {
  const rows = await fetchAllRows('communities');
  const idMap = new Map();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, row] of rows.entries()) {
    try {
      const payload = communityPayload(row);

      if (!payload.url?.trim()) {
        console.warn(`[communities] пропущена запись id=${row.id} — пустой url`);
        skipped += 1;
      } else {
        const result = await upsertCommunity(payload);
        idMap.set(row.id, result.id);
        if (result.created) {
          created += 1;
        } else {
          updated += 1;
        }
      }
    } catch (err) {
      console.error(`[communities] ошибка на id=${row.id}: ${err.message}`);
      failed += 1;
    }

    const processed = index + 1;
    if (processed % PROGRESS_EVERY === 0 || processed === rows.length) {
      console.log(`[communities] обработано ${processed}/${rows.length} (создано=${created} обновлено=${updated} пропущено=${skipped} ошибок=${failed})`);
    }
  }

  console.log(`[communities] всего=${rows.length} создано=${created} обновлено=${updated} пропущено=${skipped} ошибок=${failed}`);
  return idMap;
}

async function migrateContacts(communityIdMap) {
  const rows = await fetchAllRows('community_contacts');
  const contactsByNewCommunityId = new Map();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, row] of rows.entries()) {
    try {
      const newCommunityId = communityIdMap.get(row.community_id);
      if (newCommunityId == null) {
        console.warn(`[community_contacts] пропущен id=${row.id} — сообщество ${row.community_id} не перенесено`);
        skipped += 1;
      } else {
        if (!contactsByNewCommunityId.has(newCommunityId)) {
          contactsByNewCommunityId.set(newCommunityId, await listCommunityContacts(newCommunityId));
        }
        const existingContacts = contactsByNewCommunityId.get(newCommunityId);

        const payload = {
          community_id: newCommunityId,
          full_name: row.full_name,
          profile_url: row.profile_url,
          description: row.description,
          phone: row.phone,
          email: sanitizeEmail(row.email, { table: 'community_contacts', rowId: row.id }),
          is_active: row.is_active,
          deactivated_at: row.deactivated_at,
        };

        const existing = existingContacts.find(
          (contact) => contact.profile_url?.trim() === row.profile_url?.trim(),
        );

        if (existing) {
          await updateCommunityContact(existing.id, payload);
          updated += 1;
        } else {
          const createdContact = await createCommunityContact(payload);
          existingContacts.push(createdContact);
          created += 1;
        }
      }
    } catch (err) {
      console.error(`[community_contacts] ошибка на id=${row.id}: ${err.message}`);
      failed += 1;
    }

    const processed = index + 1;
    if (processed % PROGRESS_EVERY === 0 || processed === rows.length) {
      console.log(`[community_contacts] обработано ${processed}/${rows.length} (создано=${created} обновлено=${updated} пропущено=${skipped} ошибок=${failed})`);
    }
  }

  console.log(`[community_contacts] всего=${rows.length} создано=${created} обновлено=${updated} пропущено=${skipped} ошибок=${failed}`);
}

async function migrateSearchQueries(communityIdMap) {
  const rows = await fetchAllRows('community_search_queries', { order: 'community_id.asc' });
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, row] of rows.entries()) {
    try {
      const newCommunityId = communityIdMap.get(row.community_id);
      if (newCommunityId == null) {
        console.warn(`[community_search_queries] пропущен "${row.search_query}" — сообщество ${row.community_id} не перенесено`);
        skipped += 1;
      } else {
        const existing = await findSearchQuery(newCommunityId, row.search_query);

        if (existing) {
          const firstSeen = [existing.first_seen_at, row.first_seen_at].filter(Boolean).sort()[0];
          const lastSeen = [existing.last_seen_at, row.last_seen_at].filter(Boolean).sort().at(-1);
          await updateSearchQuery(existing.id, { first_seen_at: firstSeen, last_seen_at: lastSeen });
          updated += 1;
        } else {
          await createSearchQuery({
            community_id: newCommunityId,
            search_query: row.search_query,
            first_seen_at: row.first_seen_at,
            last_seen_at: row.last_seen_at,
          });
          created += 1;
        }
      }
    } catch (err) {
      console.error(`[community_search_queries] ошибка на "${row.search_query}" (community_id=${row.community_id}): ${err.message}`);
      failed += 1;
    }

    const processed = index + 1;
    if (processed % PROGRESS_EVERY === 0 || processed === rows.length) {
      console.log(`[community_search_queries] обработано ${processed}/${rows.length} (создано=${created} обновлено=${updated} пропущено=${skipped} ошибок=${failed})`);
    }
  }

  console.log(`[community_search_queries] всего=${rows.length} создано=${created} обновлено=${updated} пропущено=${skipped} ошибок=${failed}`);
}

async function migrateMessagesSent(communityIdMap) {
  const rows = await fetchAllRows('community_messages_sent');
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, row] of rows.entries()) {
    try {
      const existing = await findMessageSentByChatId(row.chat_id);
      if (existing) {
        skipped += 1;
      } else {
        const newCommunityId = row.community_id == null ? null : communityIdMap.get(row.community_id) ?? null;

        await createMessageSent({
          community_id: newCommunityId,
          chat_id: row.chat_id,
          msg_url: row.msg_url,
          sent_at: row.sent_at,
        });
        created += 1;
      }
    } catch (err) {
      console.error(`[community_messages_sent] ошибка на chat_id=${row.chat_id}: ${err.message}`);
      failed += 1;
    }

    const processed = index + 1;
    if (processed % PROGRESS_EVERY === 0 || processed === rows.length) {
      console.log(`[community_messages_sent] обработано ${processed}/${rows.length} (создано=${created} пропущено=${skipped} ошибок=${failed})`);
    }
  }

  console.log(`[community_messages_sent] всего=${rows.length} создано=${created} пропущено(уже было)=${skipped} ошибок=${failed}`);
}

async function main() {
  await verifyApi();

  const communityIdMap = await migrateCommunities();
  await migrateContacts(communityIdMap);
  await migrateSearchQueries(communityIdMap);
  await migrateMessagesSent(communityIdMap);

  console.log('\nГотово.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
