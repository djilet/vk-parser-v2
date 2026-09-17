import { createSalesApiHttpClient, type SalesApiEnv, type SalesApiHttpClient } from './http-client.js';
import { createSalesCommunitiesClient } from './sales-communities.js';
import { createSalesCommunityContactsClient } from './sales-community-contacts.js';
import { createSalesCommunityMessagesSentClient } from './sales-community-messages-sent.js';
import { createSalesCommunitySearchQueriesClient } from './sales-community-search-queries.js';
import { createSalesMessagesClient } from './sales-messages.js';

export * from './http-client.js';
export * from './types.js';
export * from './sales-communities.js';
export * from './sales-community-contacts.js';
export * from './sales-community-messages-sent.js';
export * from './sales-community-search-queries.js';
export * from './sales-messages.js';
export * from './token-store.js';

export type SalesApiClient = {
  http: SalesApiHttpClient;
  communities: ReturnType<typeof createSalesCommunitiesClient>;
  contacts: ReturnType<typeof createSalesCommunityContactsClient>;
  messagesSent: ReturnType<typeof createSalesCommunityMessagesSentClient>;
  searchQueries: ReturnType<typeof createSalesCommunitySearchQueriesClient>;
  messages: ReturnType<typeof createSalesMessagesClient>;
};

/** One entry point for the whole imgame-backend sales API surface — see docs/imgame-backend-sales-api.md. */
export function createSalesApiClient(env: SalesApiEnv): SalesApiClient {
  const http = createSalesApiHttpClient(env);

  return {
    http,
    communities: createSalesCommunitiesClient(http),
    contacts: createSalesCommunityContactsClient(http),
    messagesSent: createSalesCommunityMessagesSentClient(http),
    searchQueries: createSalesCommunitySearchQueriesClient(http),
    messages: createSalesMessagesClient(http),
  };
}
