import { getCommunity, iterateWritableCommunities } from '../api/salesCommunities.js';
import { listCommunityContacts } from '../api/salesCommunityContacts.js';

function matchesParity(id, parity) {
  if (parity === 'even') {
    return id % 2 === 0;
  }

  if (parity === 'odd') {
    return id % 2 === 1;
  }

  return true;
}

/**
 * Сообщества, которым ещё не писали. Отбор (есть peer_id, есть msg_url, нет записи в журнале)
 * делает API; здесь остаётся только чётность id — она делит работу между двумя аккаунтами.
 */
export async function loadPendingCommunitiesByParity(limit, parity) {
  const pending = [];

  for await (const community of iterateWritableCommunities()) {
    if (!matchesParity(community.id, parity)) {
      continue;
    }

    pending.push(community);

    if (pending.length >= limit) {
      break;
    }
  }

  const result = [];

  // msg_url приходит только в карточке сообщества, поэтому её дочитываем отдельно;
  // короткая выдача контактов уже несёт description, так что по контактам N+1 нет.
  for (const community of pending) {
    result.push({
      ...await getCommunity(community.id),
      contacts: await listCommunityContacts(community.id, { activeOnly: true }),
    });
  }

  return result;
}

export function loadPendingCommunities(limit) {
  return loadPendingCommunitiesByParity(limit, null);
}
