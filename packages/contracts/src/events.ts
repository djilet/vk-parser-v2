import type { ChatSummaryData, ExportedMessage } from './chat.js';

export type UnreadCountEvent = {
  type: 'unread_count';
  accountId: number;
  count: number;
};

export type ChatUpdatedEvent = {
  type: 'chat.updated';
  accountId: number;
  chat: ChatSummaryData;
};

export type MessageNewEvent = {
  type: 'message.new';
  accountId: number;
  peerId: number;
  message: ExportedMessage;
};

export type MessagesReadEvent = {
  type: 'messages.read';
  accountId: number;
  peerId: number;
  incoming: boolean;
};

export type AppEvent = UnreadCountEvent | ChatUpdatedEvent | MessageNewEvent | MessagesReadEvent;
