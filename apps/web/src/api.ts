// Shared wire types come from @vk-sales-bot/contracts, not redeclared here — that's what
// closed the drift where this file used to declare markChatAsRead's response as
// {accountId, peerId, upToCmid} while the server actually sent {accountId, peerId, markedRead}.
import type {
  AccountSetupStatus as ContractAccountSetupStatus,
  AccountSummary,
  AppEvent,
  ChatStatus,
  ChatSummaryData,
  ExportedMessage,
  GetChatStatusesResponse,
  GetConversationsResponse,
  GetPinnedChatsResponse,
  GetPinnedConversationsResponse,
  GetStatusConversationsResponse,
  MarkChatReadResponse,
  SendChatMessageResponse,
  SetChatPinResponse,
  SetChatStatusResponse,
  SetupJobStatus,
  VkConversationFilter,
} from '@vk-sales-bot/contracts';
import { ChatStatus as ChatStatusValues } from '@vk-sales-bot/contracts';

export type { ChatStatus, ExportedMessage, SetupJobStatus, VkConversationFilter as ConversationFilter };
export type Account = AccountSummary;
export type ChatSummary = ChatSummaryData;
export type SseEvent = AppEvent;
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
export type AccountSetupStatus = ContractAccountSetupStatus & { browserId: number };

export const DEFAULT_CHAT_STATUS: ChatStatus = ChatStatusValues.Initial;

export const CHAT_STATUS_OPTIONS: { value: ChatStatus; label: string }[] = [
  { value: ChatStatusValues.Initial, label: 'Новый' },
  { value: ChatStatusValues.ActiveDialog, label: 'Диалог' },
  { value: ChatStatusValues.Client, label: 'Клиент' },
];

export type TaggedChatStatus = typeof ChatStatusValues.ActiveDialog | typeof ChatStatusValues.Client;

export const TAGGED_CHAT_STATUSES: TaggedChatStatus[] = [ChatStatusValues.ActiveDialog, ChatStatusValues.Client];

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

export type MessagesParams = { limit?: number; offset?: number };
export type ConversationsParams = { limit?: number; offset?: number; filter?: VkConversationFilter };

export function fetchAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>('/api/accounts');
}

export function logoutAccount(browserId: number): Promise<{ browserId: number; loggedOut: boolean }> {
  return apiFetch(`/api/accounts/${browserId}`, { method: 'DELETE' });
}

export function fetchAccountSetupStatus(browserId: number): Promise<AccountSetupStatus> {
  return apiFetch<AccountSetupStatus>(`/api/accounts/${browserId}/setup`);
}

export function startAccountSession(browserId: number): Promise<{ browserId: number; started: boolean }> {
  return apiFetch(`/api/accounts/${browserId}/session`, { method: 'POST' });
}

export function startAccountToken(browserId: number): Promise<{ browserId: number; started: boolean }> {
  return apiFetch(`/api/accounts/${browserId}/token`, { method: 'POST' });
}

export function fetchConversations(accountId: number, params: ConversationsParams = {}): Promise<GetConversationsResponse> {
  const search = new URLSearchParams({ accountId: String(accountId) });

  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  if (params.filter) search.set('filter', params.filter);

  return apiFetch(`/api/conversations?${search}`);
}

export function fetchMessages(accountId: number, peerId: number, params: MessagesParams = {}): Promise<MessagesResponse> {
  const search = new URLSearchParams({ accountId: String(accountId) });

  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));

  return apiFetch(`/api/chats/${peerId}/messages?${search}`);
}

export function sendMessage(accountId: number, peerId: number, message: string): Promise<SendChatMessageResponse> {
  return apiFetch(`/api/chats/${peerId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, message }),
  });
}

export function markChatAsRead(accountId: number, peerId: number): Promise<MarkChatReadResponse> {
  return apiFetch(`/api/chats/${peerId}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
}

export function fetchPinnedPeerIds(accountId: number): Promise<GetPinnedChatsResponse> {
  return apiFetch(`/api/pinned-chats?accountId=${accountId}`);
}

export function fetchPinnedConversations(accountId: number): Promise<GetPinnedConversationsResponse> {
  return apiFetch(`/api/pinned-chats/conversations?accountId=${accountId}`);
}

export function setChatPinned(accountId: number, peerId: number, pinned: boolean): Promise<SetChatPinResponse> {
  return apiFetch(`/api/chats/${peerId}/pin`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, pinned }),
  });
}

export function fetchChatStatuses(accountId: number): Promise<GetChatStatusesResponse> {
  return apiFetch(`/api/chat-status?accountId=${accountId}`);
}

export function fetchStatusConversations(accountId: number, status: ChatStatus): Promise<GetStatusConversationsResponse> {
  const search = new URLSearchParams({ accountId: String(accountId), status });
  return apiFetch(`/api/chat-status/conversations?${search}`);
}

export function setChatStatus(accountId: number, peerId: number, status: ChatStatus): Promise<SetChatStatusResponse> {
  return apiFetch(`/api/chats/${peerId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, status }),
  });
}
