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

export function fetchAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>('/api/accounts');
}

export function fetchConversations(accountId: number): Promise<{ chats: ChatSummary[] }> {
  return apiFetch(`/api/conversations?accountId=${accountId}`);
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
