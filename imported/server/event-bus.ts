import type { ChatSummaryData } from '../vk/conversation-summary.js';
import type { ExportedMessage } from '../vk/message-format.js';

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

type EventListener = (event: AppEvent) => void;

class EventBus {
  private listeners = new Set<EventListener>();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: AppEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const eventBus = new EventBus();
