import type { AppEvent } from '@vk-sales-bot/contracts';

export type { AppEvent };

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
