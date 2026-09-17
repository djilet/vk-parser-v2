import type { SalesApiHttpClient } from './http-client.js';
import type { SalesCommunityMessageSent } from './types.js';

export const MESSAGES_SENT_PATH = '/admin/sales/community-messages-sent';

export function createSalesCommunityMessagesSentClient(http: SalesApiHttpClient) {
  return {
    findMessageSentByChatId: (chatId: number) =>
      http.findOne<SalesCommunityMessageSent>(MESSAGES_SENT_PATH, { chat_id: chatId }),

    /**
     * Все записи журнала отправок — это и есть список сообществ, с которыми есть диалог (у
     * каждой записи уже проставлен community_id и chat_id = peer_id), поэтому полная заливка
     * переписки берёт список отсюда, а не из /admin/sales/communities.
     */
    iterateMessagesSent: () => http.iterate<SalesCommunityMessageSent>(MESSAGES_SENT_PATH),

    createMessageSent: (payload: Partial<SalesCommunityMessageSent>) =>
      http.request<SalesCommunityMessageSent>('POST', MESSAGES_SENT_PATH, { body: payload }),

    updateMessageSent: (id: number, payload: Partial<SalesCommunityMessageSent>) =>
      http.request<SalesCommunityMessageSent>('PUT', `${MESSAGES_SENT_PATH}/${id}`, { body: payload }),

    countMessagesSent: (query: Record<string, unknown> = {}) => http.count(MESSAGES_SENT_PATH, query),
  };
}

export type SalesCommunityMessagesSentClient = ReturnType<typeof createSalesCommunityMessagesSentClient>;
