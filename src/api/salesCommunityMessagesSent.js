import { apiCount, apiFindOne, apiIterate, apiRequest } from './client.js';

export const MESSAGES_SENT_PATH = '/admin/sales/community-messages-sent';

export function findMessageSentByChatId(chatId) {
  return apiFindOne(MESSAGES_SENT_PATH, { chat_id: chatId });
}

/**
 * Все записи журнала отправок — это и есть список сообществ, с которыми есть диалог
 * (у каждой записи уже проставлен community_id и chat_id = peer_id), поэтому полная
 * заливка переписки берёт список отсюда, а не из /admin/sales/communities.
 */
export function iterateMessagesSent() {
  return apiIterate(MESSAGES_SENT_PATH);
}

export function createMessageSent(payload) {
  return apiRequest('POST', MESSAGES_SENT_PATH, { body: payload });
}

export function updateMessageSent(id, payload) {
  return apiRequest('PUT', `${MESSAGES_SENT_PATH}/${id}`, { body: payload });
}

export function countMessagesSent(query = {}) {
  return apiCount(MESSAGES_SENT_PATH, query);
}
