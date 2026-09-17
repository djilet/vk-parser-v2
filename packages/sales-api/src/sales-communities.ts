import type { SalesApiHttpClient } from './http-client.js';
import type { SalesCommunity } from './types.js';

export const COMMUNITIES_PATH = '/admin/sales/communities';

export function createSalesCommunitiesClient(http: SalesApiHttpClient) {
  return {
    /** Полная карточка: msg_url, phone и site отдаются только в ней, в списке их нет. */
    getCommunity: (id: number) => http.request<SalesCommunity>('GET', `${COMMUNITIES_PATH}/${id}`),

    findCommunityByUrl: (url: string) => http.findOne<SalesCommunity>(COMMUNITIES_PATH, { url }),

    findCommunityByPeerId: (peerId: number) => http.findOne<SalesCommunity>(COMMUNITIES_PATH, { peer_id: peerId }),

    createCommunity: (payload: Partial<SalesCommunity>) =>
      http.request<SalesCommunity>('POST', COMMUNITIES_PATH, { body: payload }),

    updateCommunity: (id: number, payload: Partial<SalesCommunity>) =>
      http.request<SalesCommunity>('PUT', `${COMMUNITIES_PATH}/${id}`, { body: payload }),

    deleteCommunity: (id: number) => http.request<void>('DELETE', `${COMMUNITIES_PATH}/${id}`),

    countCommunities: (query: Record<string, unknown> = {}) => http.count(COMMUNITIES_PATH, query),

    /**
     * Сообщества, которым ещё не писали: с peer_id, с msg_url и без записи в журнале
     * отправок. Фильтрация делается на бэкенде — иначе пришлось бы выкачивать весь журнал
     * по 20 строк.
     */
    iterateWritableCommunities: ({ notMessaged = true }: { notMessaged?: boolean } = {}) =>
      http.iterate<SalesCommunity>(COMMUNITIES_PATH, {
        has_peer_id: true,
        has_msg_url: true,
        not_messaged: notMessaged,
      }),

    /** Сообщества, которые ещё не проверяли LLM: is_fraud IS NULL. */
    iterateUncheckedCommunities: () => http.iterate<SalesCommunity>(COMMUNITIES_PATH, { has_fraud_check: false }),
  };
}

export type SalesCommunitiesClient = ReturnType<typeof createSalesCommunitiesClient>;
