import { apiFindOne, apiRequest } from './client.js';

export const SEARCH_QUERIES_PATH = '/admin/sales/community-search-queries';

export function findSearchQuery(communityId, searchQuery) {
  return apiFindOne(SEARCH_QUERIES_PATH, {
    community_id: communityId,
    search_query: searchQuery,
  });
}

export function createSearchQuery(payload) {
  return apiRequest('POST', SEARCH_QUERIES_PATH, { body: payload });
}

export function updateSearchQuery(id, payload) {
  return apiRequest('PUT', `${SEARCH_QUERIES_PATH}/${id}`, { body: payload });
}
