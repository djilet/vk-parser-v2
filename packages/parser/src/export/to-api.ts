import { ApiError, type SalesApiClient, type SalesCommunity } from '@vk-sales-bot/sales-api';
import { getCommunityPeerId, normalizeCommunity, type CommunityInput } from '../utils/community-fields.js';

function buildCommunityPayload(community: CommunityInput): Partial<SalesCommunity> {
  const normalized = normalizeCommunity(community);

  return {
    url: normalized.url ?? undefined,
    name: normalized.name ?? undefined,
    phone: normalized.phone ?? undefined,
    site: normalized.site ?? undefined,
    msg_url: normalized.msg_url ?? undefined,
    peer_id: getCommunityPeerId(normalized),
    last_post_date: normalized.last_post_date,
    description: normalized.description ?? undefined,
  };
}

function buildContactsPayload(community: CommunityInput) {
  return normalizeCommunity(community).contacts.map((contact) => ({
    full_name: contact.full_name ?? undefined,
    profile_url: contact.profile_url ?? '',
    description: contact.description ?? undefined,
    phone: contact.phone ?? undefined,
    email: contact.email ?? undefined,
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
async function reconcileCommunityByPeerId(
  api: SalesApiClient,
  payload: Partial<SalesCommunity>,
): Promise<number | null> {
  if (payload.peer_id == null) {
    return null;
  }

  const byPeerId = await api.communities.findCommunityByPeerId(payload.peer_id);
  if (!byPeerId) {
    return null;
  }

  const byUrl = payload.url ? await api.communities.findCommunityByUrl(payload.url) : null;
  if (byUrl && byUrl.id !== byPeerId.id) {
    await api.communities.deleteCommunity(byUrl.id);
  }

  await api.communities.updateCommunity(byPeerId.id, payload);

  return byPeerId.id;
}

async function upsertCommunity(api: SalesApiClient, payload: Partial<SalesCommunity>): Promise<number> {
  const existing = payload.url ? await api.communities.findCommunityByUrl(payload.url) : null;

  if (existing) {
    await api.communities.updateCommunity(existing.id, payload);
    return existing.id;
  }

  const created = await api.communities.createCommunity(payload);
  return created.id;
}

/** Помним, по какому запросу нашли сообщество, и когда видели его в последний раз. */
async function touchSearchQuery(api: SalesApiClient, communityId: number, searchQuery: string): Promise<void> {
  const existing = await api.searchQueries.findSearchQuery(communityId, searchQuery);
  const now = new Date().toISOString();

  if (existing) {
    await api.searchQueries.updateSearchQuery(existing.id, { last_seen_at: now });
    return;
  }

  await api.searchQueries.createSearchQuery({
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
async function syncContacts(
  api: SalesApiClient,
  communityId: number,
  contacts: ReturnType<typeof buildContactsPayload>,
): Promise<void> {
  const incoming = contacts.filter((contact) => contact.profile_url?.trim());
  const incomingByProfileUrl = new Map(incoming.map((contact) => [contact.profile_url.trim(), contact]));

  const existing = await api.contacts.listCommunityContacts(communityId);
  const existingByProfileUrl = new Map(existing.map((contact) => [contact.profile_url?.trim(), contact]));

  for (const contact of existing) {
    if (contact.is_active && !incomingByProfileUrl.has(contact.profile_url?.trim())) {
      await api.contacts.updateCommunityContact(contact.id, {
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
      await api.contacts.updateCommunityContact(match.id, payload);
      continue;
    }

    await api.contacts.createCommunityContact({ community_id: communityId, profile_url: profileUrl, ...payload });
  }
}

/** Проверка до запуска браузера: доступен ли API и есть ли у пользователя ROLE_ADMIN. */
export async function verifyApi(api: SalesApiClient): Promise<void> {
  api.http.ensureConfigured();

  try {
    await api.communities.countCommunities();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw new Error('API: у пользователя нет ROLE_ADMIN — доступ к /admin/sales закрыт');
    }

    throw error;
  }
}

export type ApiExporter = { saveCommunity: (community: CommunityInput) => Promise<number> };

export function createApiExporter(api: SalesApiClient, searchQuery: string | null | undefined): ApiExporter {
  const query = searchQuery?.trim() || null;

  async function saveCommunity(community: CommunityInput): Promise<number> {
    const payload = buildCommunityPayload(community);
    const contacts = buildContactsPayload(community);

    if (!payload.url) {
      throw new Error('У сообщества нет url');
    }

    const reconciledId = await reconcileCommunityByPeerId(api, payload);
    const communityId = reconciledId ?? (await upsertCommunity(api, payload));

    if (query) {
      await touchSearchQuery(api, communityId, query);
    }

    await syncContacts(api, communityId, contacts);

    return communityId;
  }

  return { saveCommunity };
}
