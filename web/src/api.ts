export type Account = {
  userId?: number;
  email?: string;
  firstName?: string;
  lastName?: string;
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
  id?: number;
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
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type MessagesParams = {
  limit?: number;
  offset?: number;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const text = await response.text();

  let payload: (T & { error?: string }) | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as T & { error?: string };
    } catch {
      throw new Error(`Invalid server response (${response.status})`);
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }

  if (payload == null) {
    throw new Error('API server is unavailable. Restart with: npm run dev');
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

export function fetchMessages(
  accountId: number,
  peerId: number,
  params: MessagesParams = {},
): Promise<MessagesResponse> {
  const search = new URLSearchParams({ accountId: String(accountId) });

  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }

  if (params.offset !== undefined) {
    search.set('offset', String(params.offset));
  }

  return apiFetch(`/api/chats/${peerId}/messages?${search}`);
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

export function suggestReply(
  accountId: number,
  peerId: number,
  messages: ExportedMessage[],
): Promise<{ suggestion: string }> {
  return apiFetch(`/api/chats/${peerId}/suggest-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, messages }),
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
