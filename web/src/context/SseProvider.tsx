import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { SseEvent } from '../api';

type SseListener = (event: SseEvent) => void;

const SseContext = createContext<((listener: SseListener) => () => void) | null>(null);

export function SseProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Set<SseListener>());

  useEffect(() => {
    const source = new EventSource('/api/events');

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as SseEvent;
        for (const listener of listenersRef.current) {
          listener(event);
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => {
      source.close();
    };
  }, []);

  const subscribe = useMemo(
    () => (listener: SseListener) => {
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
    [],
  );

  return <SseContext.Provider value={subscribe}>{children}</SseContext.Provider>;
}

export function useSseEvents(onEvent: (event: SseEvent) => void): void {
  const subscribe = useContext(SseContext);
  const onEventRef = useRef(onEvent);

  onEventRef.current = onEvent;

  useEffect(() => {
    if (!subscribe) {
      return;
    }

    return subscribe((event) => {
      onEventRef.current(event);
    });
  }, [subscribe]);
}
