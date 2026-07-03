import type { ChatSummary } from '../api';

export function mergeChatSummary(primary: ChatSummary, fallback?: ChatSummary): ChatSummary {
  if (!fallback) {
    return primary;
  }

  return {
    ...fallback,
    ...primary,
    lastMessage: primary.lastMessage ?? fallback.lastMessage,
    unreadCount: primary.unreadCount ?? fallback.unreadCount,
    photoUrl: primary.photoUrl ?? fallback.photoUrl,
    title: primary.title || fallback.title,
  };
}

export function upsertChat(chats: ChatSummary[], updated: ChatSummary): ChatSummary[] {
  const existing = chats.find((chat) => chat.peerId === updated.peerId);
  const merged = mergeChatSummary(updated, existing);
  const rest = chats.filter((chat) => chat.peerId !== updated.peerId);
  return [merged, ...rest];
}

export function upsertPinnedChat(pinnedChats: ChatSummary[], updated: ChatSummary): ChatSummary[] {
  const index = pinnedChats.findIndex((chat) => chat.peerId === updated.peerId);
  if (index === -1) {
    return pinnedChats;
  }

  const next = [...pinnedChats];
  next[index] = mergeChatSummary(updated, pinnedChats[index]);
  return next;
}

export function findBrowserIdForAccount(accounts: { userId?: number; browserId: number }[], accountId: number): number | null {
  const account = accounts.find((entry) => entry.userId === accountId);
  return account?.browserId ?? null;
}
