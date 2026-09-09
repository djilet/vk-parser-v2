import { countCommunities as countCommunitiesApi } from '../api/salesCommunities.js';
import { countMessagesSent } from '../api/salesCommunityMessagesSent.js';
import { getZonedDayBounds } from '../utils/timezone.js';

export async function countMessagesSentToday(timeZone) {
  const { start, end } = getZonedDayBounds(timeZone);

  // sent_at_to на бэкенде — включающая граница, поэтому берём последнюю миллисекунду суток.
  const lastMs = new Date(new Date(end).getTime() - 1).toISOString();

  return countMessagesSent({ sent_at_from: start, sent_at_to: lastMs });
}

export function countMessagesSentTotal() {
  return countMessagesSent();
}

export function countCommunities() {
  return countCommunitiesApi();
}

export function countWritableCommunities() {
  return countCommunitiesApi({ has_peer_id: true, has_msg_url: true });
}
