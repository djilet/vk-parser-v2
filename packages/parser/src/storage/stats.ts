import { getZonedDayBounds } from '@vk-sales-bot/core';
import type { SalesApiClient } from '@vk-sales-bot/sales-api';

export async function countMessagesSentToday(api: SalesApiClient, timeZone: string): Promise<number> {
  const { start, end } = getZonedDayBounds(timeZone);

  // sent_at_to на бэкенде — включающая граница, поэтому берём последнюю миллисекунду суток.
  const lastMs = new Date(new Date(end).getTime() - 1).toISOString();

  return api.messagesSent.countMessagesSent({ sent_at_from: start, sent_at_to: lastMs });
}

export function countMessagesSentTotal(api: SalesApiClient): Promise<number> {
  return api.messagesSent.countMessagesSent();
}

export function countCommunities(api: SalesApiClient): Promise<number> {
  return api.communities.countCommunities();
}

export function countWritableCommunities(api: SalesApiClient): Promise<number> {
  return api.communities.countCommunities({ has_peer_id: true, has_msg_url: true });
}
