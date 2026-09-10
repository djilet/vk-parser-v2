import { apiFindOne, apiIterate, apiRequest, apiCount } from './client.js';

export const COMMUNITIES_PATH = '/admin/sales/communities';

/** Полная карточка: msg_url, phone и site отдаются только в ней, в списке их нет. */
export function getCommunity(id) {
  return apiRequest('GET', `${COMMUNITIES_PATH}/${id}`);
}

export function findCommunityByUrl(url) {
  return apiFindOne(COMMUNITIES_PATH, { url });
}

export function findCommunityByPeerId(peerId) {
  return apiFindOne(COMMUNITIES_PATH, { peer_id: peerId });
}

export function createCommunity(payload) {
  return apiRequest('POST', COMMUNITIES_PATH, { body: payload });
}

export function updateCommunity(id, payload) {
  return apiRequest('PUT', `${COMMUNITIES_PATH}/${id}`, { body: payload });
}

export function deleteCommunity(id) {
  return apiRequest('DELETE', `${COMMUNITIES_PATH}/${id}`);
}

export function countCommunities(query = {}) {
  return apiCount(COMMUNITIES_PATH, query);
}

/**
 * Сообщества, которым ещё не писали: с peer_id, с msg_url и без записи в журнале отправок.
 * Фильтрация делается на бэкенде — иначе пришлось бы выкачивать весь журнал по 20 строк.
 */
export function iterateWritableCommunities({ notMessaged = true } = {}) {
  return apiIterate(COMMUNITIES_PATH, {
    has_peer_id: true,
    has_msg_url: true,
    not_messaged: notMessaged,
  });
}

/** Сообщества, которые ещё не проверяли LLM: is_fraud IS NULL. */
export function iterateUncheckedCommunities() {
  return apiIterate(COMMUNITIES_PATH, { has_fraud_check: false });
}
