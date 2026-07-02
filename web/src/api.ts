export type Account = {
  userId?: number;
  email?: string;
  browserId: number;
  expired: boolean;
};

export type LastMessage = {
  text: string;
  date: string;
  out: boolean;
};

export type ChatSummary = {
  peerId: number;
  peerType: string;
  title: string;
  photoUrl?: string;
  unreadCount: number;
  lastMessage: LastMessage | null;
};

export type ExportedMessage = {
  date: string;
  fromId: number;
  text: string;
  files: { type: string; url: string; name?: string }[];
};

export type MessagesResponse = {
  accountId: number;
  peerId: number;
  userId?: number;
  messages: ExportedMessage[];
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }

  return payload;
}

export type ConversationFilter = 'all' | 'unread' | 'important' | 'unanswered';

export type ConversationsResponse = {
  accountId: number;
  chats: ChatSummary[];
  total: number;
  offset: number;
  limit: number;
  filter: ConversationFilter;
};

export type ConversationsParams = {
  limit?: number;
  offset?: number;
  filter?: ConversationFilter;
};

export function fetchAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>('/api/accounts');
}

export function fetchConversations(
  accountId: number,
  params: ConversationsParams = {},
): Promise<ConversationsResponse> {
  const search = new URLSearchParams({ accountId: String(accountId) });

  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }

  if (params.offset !== undefined) {
    search.set('offset', String(params.offset));
  }

  if (params.filter) {
    search.set('filter', params.filter);
  }

  return apiFetch(`/api/conversations?${search}`);
}

export function fetchMessages(accountId: number, peerId: number): Promise<MessagesResponse> {
  return apiFetch(`/api/chats/${peerId}/messages?accountId=${accountId}`);
}

export function sendMessage(
  accountId: number,
  peerId: number,
  message: string,
): Promise<{ messageId: number }> {
  return apiFetch(`/api/chats/${peerId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, message }),
  });
}

export function fetchPinnedPeerIds(accountId: number): Promise<{ accountId: number; peerIds: number[] }> {
  return apiFetch(`/api/pinned-chats?accountId=${accountId}`);
}

export function fetchPinnedConversations(
  accountId: number,
): Promise<{ accountId: number; chats: ChatSummary[] }> {
  return apiFetch(`/api/pinned-chats/conversations?accountId=${accountId}`);
}

export function setChatPinned(
  accountId: number,
  peerId: number,
  pinned: boolean,
): Promise<{ accountId: number; peerId: number; pinned: boolean; peerIds: number[] }> {
  return apiFetch(`/api/chats/${peerId}/pin`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, pinned }),
  });
}
