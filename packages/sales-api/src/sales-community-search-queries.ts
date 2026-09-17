import type { SalesApiHttpClient } from './http-client.js';
import type { SalesCommunitySearchQuery } from './types.js';

export const SEARCH_QUERIES_PATH = '/admin/sales/community-search-queries';

export function createSalesCommunitySearchQueriesClient(http: SalesApiHttpClient) {
  return {
    findSearchQuery: (communityId: number, searchQuery: string) =>
      http.findOne<SalesCommunitySearchQuery>(SEARCH_QUERIES_PATH, {
        community_id: communityId,
        search_query: searchQuery,
      }),

    createSearchQuery: (payload: Partial<SalesCommunitySearchQuery>) =>
      http.request<SalesCommunitySearchQuery>('POST', SEARCH_QUERIES_PATH, { body: payload }),

    updateSearchQuery: (id: number, payload: Partial<SalesCommunitySearchQuery>) =>
      http.request<SalesCommunitySearchQuery>('PUT', `${SEARCH_QUERIES_PATH}/${id}`, { body: payload }),
  };
}

export type SalesCommunitySearchQueriesClient = ReturnType<typeof createSalesCommunitySearchQueriesClient>;
