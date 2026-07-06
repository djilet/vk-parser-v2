export type ChatStatus = 'initial' | 'active_dialog' | 'client';

export const DEFAULT_CHAT_STATUS: ChatStatus = 'initial';

export const CHAT_STATUS_OPTIONS: { value: ChatStatus; label: string }[] = [
  { value: 'initial', label: 'Новый' },
  { value: 'active_dialog', label: 'Диалог' },
  { value: 'client', label: 'Клиент' },
];

export type TaggedChatStatus = 'active_dialog' | 'client';

export const TAGGED_CHAT_STATUSES: TaggedChatStatus[] = ['active_dialog', 'client'];

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

export type SseUnreadCountEvent = {
  type: 'unread_count';
  accountId: number;
  count: number;
};

export type SseChatUpdatedEvent = {
  type: 'chat.updated';
  accountId: number;
  chat: ChatSummary;
};

export type SseMessageNewEvent = {
  type: 'message.new';
  accountId: number;
  peerId: number;
  message: ExportedMessage;
};

export type SseMessagesReadEvent = {
  type: 'messages.read';
  accountId: number;
  peerId: number;
  incoming: boolean;
};

export type SseEvent =
  | SseUnreadCountEvent
  | SseChatUpdatedEvent
  | SseMessageNewEvent
  | SseMessagesReadEvent;

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

export function markChatAsRead(
  accountId: number,
  peerId: number,
): Promise<{ accountId: number; peerId: number; upToCmid: number | null }> {
  return apiFetch(`/api/chats/${peerId}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
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

export function fetchChatStatuses(
  accountId: number,
): Promise<{ accountId: number; statuses: Record<number, ChatStatus> }> {
  return apiFetch(`/api/chat-status?accountId=${accountId}`);
}

export function fetchStatusConversations(
  accountId: number,
  status: ChatStatus,
): Promise<{ accountId: number; status: ChatStatus; chats: ChatSummary[] }> {
  const search = new URLSearchParams({
    accountId: String(accountId),
    status,
  });

  return apiFetch(`/api/chat-status/conversations?${search}`);
}

export function setChatStatus(
  accountId: number,
  peerId: number,
  status: ChatStatus,
): Promise<{ accountId: number; peerId: number; status: ChatStatus; statuses: Record<number, ChatStatus> }> {
  return apiFetch(`/api/chats/${peerId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, status }),
  });
}
