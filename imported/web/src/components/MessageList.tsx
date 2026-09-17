import { Spin } from 'antd';
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ExportedMessage } from '../api';

const TOP_LOAD_THRESHOLD_PX = 80;
const NEAR_BOTTOM_THRESHOLD_PX = 80;

type MessageListProps = {
  messages: ExportedMessage[];
  userId?: number;
  loadingMore?: boolean;
  hasMore?: boolean;
  paginationReady?: boolean;
  stickToBottom?: boolean;
  scrollAnchorIndex?: number | null;
  onStickToBottomApplied?: () => void;
  onScrollAnchorApplied?: () => void;
  onNearBottomChange?: (nearBottom: boolean) => void;
  onLoadOlder?: () => void;
};

function formatMessageTime(date: string): string {
  return new Date(date).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function messageKey(message: ExportedMessage, index: number): string {
  return message.id != null ? String(message.id) : `${message.date}-${message.fromId}-${index}`;
}

function isScrollable(container: HTMLDivElement): boolean {
  return container.scrollHeight > container.clientHeight + 1;
}

export default function MessageList({
  messages,
  userId,
  loadingMore = false,
  hasMore = false,
  paginationReady = false,
  stickToBottom = false,
  scrollAnchorIndex = null,
  onStickToBottomApplied,
  onScrollAnchorApplied,
  onNearBottomChange,
  onLoadOlder,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingScrollRestoreRef = useRef(false);
  const previousScrollHeightRef = useRef(0);
  const paginationBlockedRef = useRef(false);
  const paginationReadyRef = useRef(false);
  const loadingMoreRef = useRef(false);

  paginationReadyRef.current = paginationReady;
  loadingMoreRef.current = loadingMore;

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    if (stickToBottom) {
      container.scrollTop = container.scrollHeight;
      onNearBottomChange?.(true);
      onStickToBottomApplied?.();
      return;
    }

    if (scrollAnchorIndex == null) {
      return;
    }

    const anchor = rowRefs.current.get(scrollAnchorIndex);

    if (anchor) {
      container.scrollTop = anchor.offsetTop;
    } else {
      const heightDiff = container.scrollHeight - previousScrollHeightRef.current;
      container.scrollTop += heightDiff;
    }

    paginationBlockedRef.current = true;
    pendingScrollRestoreRef.current = false;
    onScrollAnchorApplied?.();
  }, [messages, stickToBottom, scrollAnchorIndex, onStickToBottomApplied, onScrollAnchorApplied]);

  useLayoutEffect(() => {
    if (!loadingMore && scrollAnchorIndex == null) {
      pendingScrollRestoreRef.current = false;
    }
  }, [loadingMore, scrollAnchorIndex]);

  const tryLoadOlder = useCallback(() => {
    const container = scrollRef.current;

    if (
      !container ||
      !hasMore ||
      loadingMoreRef.current ||
      !paginationReadyRef.current ||
      pendingScrollRestoreRef.current ||
      paginationBlockedRef.current ||
      !onLoadOlder
    ) {
      return;
    }

    if (!isScrollable(container)) {
      return;
    }

    if (container.scrollTop > TOP_LOAD_THRESHOLD_PX) {
      return;
    }

    previousScrollHeightRef.current = container.scrollHeight;
    pendingScrollRestoreRef.current = true;
    onLoadOlder();
  }, [hasMore, onLoadOlder]);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (container) {
      if (container.scrollTop > TOP_LOAD_THRESHOLD_PX) {
        paginationBlockedRef.current = false;
      }

      if (onNearBottomChange) {
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight;
        onNearBottomChange(distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX);
      }
    }

    tryLoadOlder();
  }, [tryLoadOlder, onNearBottomChange]);

  return (
    <div className="chat-messages" ref={scrollRef} onScroll={handleScroll}>
      {loadingMore && (
        <div className="chat-messages-load-more">
          <Spin size="small" />
        </div>
      )}

      {messages.map((message, index) => {
        const outgoing = userId != null ? message.fromId === userId : false;

        return (
          <div
            key={messageKey(message, index)}
            ref={(element) => {
              if (element) {
                rowRefs.current.set(index, element);
              } else {
                rowRefs.current.delete(index);
              }
            }}
            className={`message-row ${outgoing ? 'outgoing' : ''}`}
          >
            <div className="message-bubble">
              {message.text || (message.files.length > 0 ? 'Вложение' : '')}
              {message.files.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {message.files.map((file) => (
                    <a
                      key={file.url}
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'block', fontSize: 12 }}
                    >
                      {file.name ?? file.type}
                    </a>
                  ))}
                </div>
              )}
              <div className="message-time">{formatMessageTime(message.date)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function dedupeMessagesList(messages: ExportedMessage[]): ExportedMessage[] {
  const withId = messages.filter((message) => message.id != null);
  const seenIds = new Set<number>();
  const result: ExportedMessage[] = [];

  for (const message of messages) {
    if (message.id != null) {
      if (seenIds.has(message.id)) {
        continue;
      }
      seenIds.add(message.id);
      result.push(message);
      continue;
    }

    const hasRealDuplicate = withId.some(
      (candidate) => candidate.text === message.text && candidate.fromId === message.fromId,
    );
    if (hasRealDuplicate) {
      continue;
    }

    result.push(message);
  }

  return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function mergeMessages(
  existing: ExportedMessage[],
  older: ExportedMessage[],
): { messages: ExportedMessage[]; prependedCount: number } {
  const messages = dedupeMessagesList([...older, ...existing]);
  const prependedCount = Math.max(0, messages.length - existing.length);

  return { messages, prependedCount };
}

export function appendNewMessages(
  existing: ExportedMessage[],
  latest: ExportedMessage[],
): { messages: ExportedMessage[]; appendedCount: number } {
  const messages = dedupeMessagesList([...existing, ...latest]);
  const appendedCount = Math.max(0, messages.length - existing.length);

  return { messages, appendedCount };
}
