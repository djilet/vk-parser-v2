import { CHAT_STATUS_OPTIONS, DEFAULT_CHAT_STATUS, TAGGED_CHAT_STATUSES, type ChatStatus, type ChatSummary, type TaggedChatStatus } from '../api';

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

export function removeChatByPeerId(chats: ChatSummary[], peerId: number): ChatSummary[] {
  return chats.filter((chat) => chat.peerId !== peerId);
}

export function findBrowserIdForAccount(accounts: { userId?: number; browserId: number }[], accountId: number): number | null {
  const account = accounts.find((entry) => entry.userId === accountId);
  return account?.browserId ?? null;
}

export function resolveChatStatus(
  peerId: number,
  statuses: Record<number, ChatStatus>,
): ChatStatus {
  return statuses[peerId] ?? DEFAULT_CHAT_STATUS;
}

export function isTaggedChatStatus(status: ChatStatus): status is TaggedChatStatus {
  return TAGGED_CHAT_STATUSES.includes(status as TaggedChatStatus);
}

export function filterInitialChats(
  chats: ChatSummary[],
  statuses: Record<number, ChatStatus>,
): ChatSummary[] {
  return chats.filter(
    (chat) => resolveChatStatus(chat.peerId, statuses) === DEFAULT_CHAT_STATUS,
  );
}

export function filterPinnedForStatus(
  pinnedPeerIds: number[],
  pinnedChats: ChatSummary[],
  status: ChatStatus,
  statuses: Record<number, ChatStatus>,
): { peerIds: number[]; chats: ChatSummary[] } {
  const peerIds = pinnedPeerIds.filter(
    (peerId) => resolveChatStatus(peerId, statuses) === status,
  );
  const peerIdSet = new Set(peerIds);
  const chats = pinnedChats.filter((chat) => peerIdSet.has(chat.peerId));

  return { peerIds, chats };
}

export function countUnreadChats(chats: ChatSummary[]): number {
  return chats.filter((chat) => chat.unreadCount > 0).length;
}

export function countUnreadChatsByStatus(
  chatsByStatus: Record<ChatStatus, ChatSummary[]>,
): Record<ChatStatus, number> {
  const counts = Object.fromEntries(
    CHAT_STATUS_OPTIONS.map(({ value }) => [value, 0]),
  ) as Record<ChatStatus, number>;

  for (const { value } of CHAT_STATUS_OPTIONS) {
    counts[value] = countUnreadChats(chatsByStatus[value] ?? []);
  }

  return counts;
}

export function sortChatListItems(
  items: Array<{ chat: ChatSummary; pinned: boolean }>,
): Array<{ chat: ChatSummary; pinned: boolean }> {
  return [...items].sort((left, right) => {
    const leftUnread = left.chat.unreadCount > 0 ? 1 : 0;
    const rightUnread = right.chat.unreadCount > 0 ? 1 : 0;

    if (leftUnread !== rightUnread) {
      return rightUnread - leftUnread;
    }

    const leftTime = left.chat.lastMessage ? new Date(left.chat.lastMessage.date).getTime() : 0;
    const rightTime = right.chat.lastMessage ? new Date(right.chat.lastMessage.date).getTime() : 0;
    return rightTime - leftTime;
  });
}
