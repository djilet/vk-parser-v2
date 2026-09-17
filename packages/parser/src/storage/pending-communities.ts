import type { SalesApiClient, SalesCommunity, SalesCommunityContact } from '@vk-sales-bot/sales-api';

export type PendingCommunity = SalesCommunity & { contacts: SalesCommunityContact[] };
export type Parity = 'even' | 'odd' | null;

function matchesParity(id: number, parity: Parity): boolean {
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
export async function loadPendingCommunitiesByParity(
  api: SalesApiClient,
  limit: number,
  parity: Parity,
): Promise<PendingCommunity[]> {
  const pending: SalesCommunity[] = [];

  for await (const community of api.communities.iterateWritableCommunities()) {
    if (!matchesParity(community.id, parity)) {
      continue;
    }

    pending.push(community);

    if (pending.length >= limit) {
      break;
    }
  }

  const result: PendingCommunity[] = [];

  // msg_url приходит только в карточке сообщества, поэтому её дочитываем отдельно; короткая
  // выдача контактов уже несёт description, так что по контактам N+1 нет.
  for (const community of pending) {
    result.push({
      ...(await api.communities.getCommunity(community.id)),
      contacts: await api.contacts.listCommunityContacts(community.id, { activeOnly: true }),
    });
  }

  return result;
}

export function loadPendingCommunities(api: SalesApiClient, limit: number): Promise<PendingCommunity[]> {
  return loadPendingCommunitiesByParity(api, limit, null);
}
