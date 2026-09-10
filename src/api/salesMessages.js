import { apiCount, apiIterate, apiRequest } from './client.js';

export const MESSAGES_PATH = '/admin/sales/messages';

/**
 * Идемпотентная заливка одного батча (≤500) сообщений одного сообщества:
 * ON CONFLICT (community_id, vk_message_id) DO NOTHING на бэкенде.
 */
export function uploadMessages(communityId, items) {
  return apiRequest('POST', `${MESSAGES_PATH}/upload`, {
    body: { community_id: communityId, items },
  });
}

/** Watermark'и по всем сообществам одним запросом: {items:[{community_id,last_vk_message_id,total}]}. */
export function fetchSyncState() {
  return apiRequest('GET', `${MESSAGES_PATH}/sync-state`);
}

/** Вся переписка с сообществом, от старых сообщений к новым. */
export function iterateCommunityMessages(communityId) {
  return apiIterate(`/admin/sales/communities/${communityId}/messages`);
}

export function countMessages(query = {}) {
  return apiCount(MESSAGES_PATH, query);
}
