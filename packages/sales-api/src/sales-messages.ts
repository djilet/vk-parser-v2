import type { SalesApiHttpClient } from './http-client.js';
import type { SalesMessage } from './types.js';

export const MESSAGES_PATH = '/admin/sales/messages';

export type SyncStateEntry = { community_id: number; last_vk_message_id: number | null; total: number };

export function createSalesMessagesClient(http: SalesApiHttpClient) {
  return {
    /** Идемпотентная заливка одного батча (≤500) сообщений одного сообщества: ON CONFLICT (community_id, vk_message_id) DO NOTHING на бэкенде. */
    uploadMessages: (communityId: number, items: Array<Partial<SalesMessage>>) =>
      http.request<{ inserted: number }>('POST', `${MESSAGES_PATH}/upload`, {
        body: { community_id: communityId, items },
      }),

    /** Watermark'и по всем сообществам одним запросом. */
    fetchSyncState: () => http.request<{ items: SyncStateEntry[] }>('GET', `${MESSAGES_PATH}/sync-state`),

    /** Вся переписка с сообществом, от старых сообщений к новым. */
    iterateCommunityMessages: (communityId: number) =>
      http.iterate<SalesMessage>(`/admin/sales/communities/${communityId}/messages`),

    /** Частичное обновление одного сообщения (например, простановка from_id задним числом). */
    updateMessage: (id: number, payload: Partial<SalesMessage>) =>
      http.request<SalesMessage>('PUT', `${MESSAGES_PATH}/${id}`, { body: payload }),
  };
}

export type SalesMessagesClient = ReturnType<typeof createSalesMessagesClient>;
