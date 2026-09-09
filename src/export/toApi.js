import { getCommunityPeerId, normalizeCommunity } from '../utils/communityFields.js';
import { ensureApiConfigured } from '../api/auth.js';
import {
  countCommunities,
  createCommunity,
  deleteCommunity,
  findCommunityByPeerId,
  findCommunityByUrl,
  updateCommunity,
} from '../api/salesCommunities.js';
import {
  createCommunityContact,
  listCommunityContacts,
  updateCommunityContact,
} from '../api/salesCommunityContacts.js';
import {
  createSearchQuery,
  findSearchQuery,
  updateSearchQuery,
} from '../api/salesCommunitySearchQueries.js';

function buildCommunityPayload(community) {
  const normalized = normalizeCommunity(community);

  return {
    url: normalized.url,
    name: normalized.name,
    phone: normalized.phone,
    site: normalized.site,
    msg_url: normalized.msg_url,
    peer_id: getCommunityPeerId(normalized),
    last_post_date: normalized.last_post_date,
    description: normalized.description,
  };
}

function buildContactsPayload(community) {
  return normalizeCommunity(community).contacts.map((contact) => ({
    full_name: contact.full_name,
    profile_url: contact.profile_url,
    description: contact.description,
    phone: contact.phone,
    email: contact.email,
  }));
}

/**
 * Сообщество могло сменить адрес страницы, сохранив peer_id. Тогда в базе живут две записи:
 * старая с этим peer_id и, возможно, чужая с новым url. Освобождаем url и переносим на него
 * запись с peer_id — иначе создание упало бы на уникальном peer_id.
 *
 * Возвращает id уже обновлённой записи, если по peer_id было что реконсилить — тогда
 * upsertCommunity вызывать не нужно, иначе одно и то же сообщество обновилось бы дважды.
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
  const existing = await findCommunityByUrl(payload.url);

  if (existing) {
    await updateCommunity(existing.id, payload);
    return existing.id;
  }

  const created = await createCommunity(payload);

  return created.id;
}

/** Помним, по какому запросу нашли сообщество, и когда видели его в последний раз. */
async function touchSearchQuery(communityId, searchQuery) {
  const existing = await findSearchQuery(communityId, searchQuery);
  const now = new Date().toISOString();

  if (existing) {
    await updateSearchQuery(existing.id, { last_seen_at: now });
    return;
  }

  await createSearchQuery({
    community_id: communityId,
    search_query: searchQuery,
    first_seen_at: now,
    last_seen_at: now,
  });
}

/**
 * Контакты не удаляем: пропавшие со страницы гасим флагом, вернувшиеся включаем обратно.
 * Так сохраняется история, кому уже писали.
 */
async function syncContacts(communityId, contacts) {
  const incoming = contacts.filter((contact) => contact.profile_url?.trim());
  const incomingByProfileUrl = new Map(
    incoming.map((contact) => [contact.profile_url.trim(), contact]),
  );

  const existing = await listCommunityContacts(communityId);
  const existingByProfileUrl = new Map(
    existing.map((contact) => [contact.profile_url?.trim(), contact]),
  );

  for (const contact of existing) {
    if (contact.is_active && !incomingByProfileUrl.has(contact.profile_url?.trim())) {
      await updateCommunityContact(contact.id, {
        is_active: false,
        deactivated_at: new Date().toISOString(),
      });
    }
  }

  for (const [profileUrl, contact] of incomingByProfileUrl) {
    const payload = {
      full_name: contact.full_name,
      description: contact.description,
      phone: contact.phone,
      email: contact.email,
      is_active: true,
      deactivated_at: null,
    };

    const match = existingByProfileUrl.get(profileUrl);

    if (match) {
      await updateCommunityContact(match.id, payload);
      continue;
    }

    await createCommunityContact({
      community_id: communityId,
      profile_url: profileUrl,
      ...payload,
    });
  }
}

/** Проверка до запуска браузера: доступен ли API и есть ли у пользователя ROLE_ADMIN. */
export async function verifyApi() {
  ensureApiConfigured();

  try {
    await countCommunities();
  } catch (err) {
    if (err.status === 403) {
      throw new Error('API: у пользователя нет ROLE_ADMIN — доступ к /admin/sales закрыт');
    }

    throw err;
  }
}

export function createApiExporter(searchQuery) {
  const query = searchQuery?.trim() || null;

  async function saveCommunity(community) {
    const payload = buildCommunityPayload(community);
    const contacts = buildContactsPayload(community);

    if (!payload.url) {
      throw new Error('У сообщества нет url');
    }

    const reconciledId = await reconcileCommunityByPeerId(payload);
    const communityId = reconciledId ?? await upsertCommunity(payload);

    if (query) {
      await touchSearchQuery(communityId, query);
    }

    await syncContacts(communityId, contacts);

    return communityId;
  }

  return { saveCommunity };
}
