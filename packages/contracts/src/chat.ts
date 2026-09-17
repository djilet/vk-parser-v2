/**
 * The shared vocabulary between apps/server and apps/web. Kept dependency-free and node-free
 * on purpose — this package must be safe to import from the browser bundle with zero runtime
 * cost, so nothing here may import from @vk-sales-bot/core or @vk-sales-bot/chat even for types
 * only (verbatimModuleSyntax erases `import type`, but the package boundary itself is the
 * simpler guarantee to keep true).
 */

export type PeerType = 'user' | 'chat' | 'group' | 'email';

export type ChatLastMessage = {
  text: string;
  date: string;
  out: boolean;
};

export type ChatSummaryData = {
  peerId: number;
  peerType: string;
  title: string;
  photoUrl?: string;
  unreadCount: number;
  lastMessage: ChatLastMessage | null;
};

export type ExportedFile = {
  type: string;
  url: string;
  name?: string;
};

export type ExportedMessage = {
  id?: number;
  date: string;
  fromId: number;
  text: string;
  files: ExportedFile[];
};

/**
 * A const-object union instead of a TS `enum` — enums emit runtime code, which would put JS
 * into an otherwise type-only browser bundle. @vk-sales-bot/chat re-exports this same value
 * (rather than redefining it) so the UI and the server-side validation can never drift apart.
 */
export const ChatStatus = {
  Initial: 'initial',
  ActiveDialog: 'active_dialog',
  Client: 'client',
} as const;

export type ChatStatus = (typeof ChatStatus)[keyof typeof ChatStatus];

export const DEFAULT_CHAT_STATUS: ChatStatus = ChatStatus.Initial;

export const CHAT_STATUSES = [ChatStatus.Initial, ChatStatus.ActiveDialog, ChatStatus.Client] as const;

export function isChatStatus(value: unknown): value is ChatStatus {
  return typeof value === 'string' && (CHAT_STATUSES as readonly string[]).includes(value);
}
