import type { AccountSetupStatus, AccountSummary } from './account.js';
import type { ChatStatus, ChatSummaryData, ExportedMessage } from './chat.js';

export type ApiErrorBody = { error: string };

// GET /api/accounts
export type GetAccountsResponse = AccountSummary[];

// DELETE /api/accounts/:browserId
export type LogoutAccountResponse = { browserId: number; loggedOut: true };

// GET /api/accounts/:browserId/setup
export type GetAccountSetupResponse = AccountSetupStatus & { browserId: number };

// POST /api/accounts/:browserId/session
// POST /api/accounts/:browserId/token
export type StartAccountJobResponse = { browserId: number; started: true };

export type VkConversationFilter = 'all' | 'unread' | 'important' | 'unanswered';

// GET /api/conversations
export type GetConversationsQuery = {
  accountId: number;
  limit?: number;
  offset?: number;
  filter?: VkConversationFilter;
};
export type GetConversationsResponse = {
  accountId: number;
  chats: ChatSummaryData[];
  total: number;
  offset: number;
  limit: number;
  filter: VkConversationFilter;
};

// GET /api/pinned-chats
export type GetPinnedChatsQuery = { accountId: number };
export type GetPinnedChatsResponse = { accountId: number; peerIds: number[] };

// GET /api/pinned-chats/conversations
export type GetPinnedConversationsQuery = { accountId: number };
export type GetPinnedConversationsResponse = { accountId: number; chats: ChatSummaryData[] };

// PUT /api/chats/:peerId/pin
export type SetChatPinRequest = { accountId: number; pinned: boolean };
export type SetChatPinResponse = { accountId: number; peerId: number; pinned: boolean; peerIds: number[] };

// GET /api/chat-status
export type GetChatStatusesQuery = { accountId: number };
export type GetChatStatusesResponse = { accountId: number; statuses: Record<number, ChatStatus> };

// GET /api/chat-status/conversations
export type GetStatusConversationsQuery = { accountId: number; status: ChatStatus };
export type GetStatusConversationsResponse = { accountId: number; status: ChatStatus; chats: ChatSummaryData[] };

// PUT /api/chats/:peerId/status
export type SetChatStatusRequest = { accountId: number; status: ChatStatus };
export type SetChatStatusResponse = {
  accountId: number;
  peerId: number;
  status: ChatStatus;
  statuses: Record<number, ChatStatus>;
};

// GET /api/chats/:peerId/messages
export type GetMessagesQuery = { accountId: number; limit?: number; offset?: number };
export type GetMessagesResponse = {
  accountId: number;
  peerId: number;
  userId: number | undefined;
  messages: ExportedMessage[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  markedRead: boolean;
};

// POST /api/chats/:peerId/messages
export type SendChatMessageRequest = { accountId: number; message: string };
export type SendChatMessageResponse = { messageId: number; peerId: number; accountId: number };

// POST /api/chats/:peerId/read — the pair that used to drift: the web declared
// {accountId, peerId, upToCmid} while the server actually sent {accountId, peerId, markedRead}.
export type MarkChatReadRequest = { accountId: number };
export type MarkChatReadResponse = { accountId: number; peerId: number; markedRead: boolean };
