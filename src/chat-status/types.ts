export enum ChatStatus {
  Initial = 'initial',
  ActiveDialog = 'active_dialog',
  Client = 'client',
}

export const DEFAULT_CHAT_STATUS = ChatStatus.Initial;

export const CHAT_STATUSES = [ChatStatus.Initial, ChatStatus.ActiveDialog, ChatStatus.Client] as const;

export function isChatStatus(value: unknown): value is ChatStatus {
  return typeof value === 'string' && CHAT_STATUSES.includes(value as ChatStatus);
}
