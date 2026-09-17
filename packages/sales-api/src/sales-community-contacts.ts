import type { SalesApiHttpClient } from './http-client.js';
import type { SalesCommunityContact } from './types.js';

export const CONTACTS_PATH = '/admin/sales/community-contacts';

export function createSalesCommunityContactsClient(http: SalesApiHttpClient) {
  return {
    /** Список короткий: id, community_id, full_name, profile_url, is_active. */
    listCommunityContacts: (communityId: number, { activeOnly = false }: { activeOnly?: boolean } = {}) =>
      http.listAll<SalesCommunityContact>(CONTACTS_PATH, {
        community_id: communityId,
        is_active: activeOnly ? true : undefined,
      }),

    /** Полная карточка: description, phone, email отдаются только в ней. */
    getCommunityContact: (id: number) => http.request<SalesCommunityContact>('GET', `${CONTACTS_PATH}/${id}`),

    createCommunityContact: (payload: Partial<SalesCommunityContact>) =>
      http.request<SalesCommunityContact>('POST', CONTACTS_PATH, { body: payload }),

    updateCommunityContact: (id: number, payload: Partial<SalesCommunityContact>) =>
      http.request<SalesCommunityContact>('PUT', `${CONTACTS_PATH}/${id}`, { body: payload }),
  };
}

export type SalesCommunityContactsClient = ReturnType<typeof createSalesCommunityContactsClient>;
