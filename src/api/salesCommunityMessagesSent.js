import { apiCount, apiFindOne, apiRequest } from './client.js';

export const MESSAGES_SENT_PATH = '/admin/sales/community-messages-sent';

export function findMessageSentByChatId(chatId) {
  return apiFindOne(MESSAGES_SENT_PATH, { chat_id: chatId });
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
