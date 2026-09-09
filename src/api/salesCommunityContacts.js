import { apiListAll, apiRequest } from './client.js';

export const CONTACTS_PATH = '/admin/sales/community-contacts';

/** Список короткий: id, community_id, full_name, profile_url, is_active. */
export function listCommunityContacts(communityId, { activeOnly = false } = {}) {
  return apiListAll(CONTACTS_PATH, {
    community_id: communityId,
    is_active: activeOnly ? true : undefined,
  });
}

/** Полная карточка: description, phone, email отдаются только в ней. */
export function getCommunityContact(id) {
  return apiRequest('GET', `${CONTACTS_PATH}/${id}`);
}

export function createCommunityContact(payload) {
  return apiRequest('POST', CONTACTS_PATH, { body: payload });
}

export function updateCommunityContact(id, payload) {
  return apiRequest('PUT', `${CONTACTS_PATH}/${id}`, { body: payload });
}
