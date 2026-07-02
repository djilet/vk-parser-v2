import { Spin } from 'antd';
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ExportedMessage } from '../api';

const TOP_LOAD_THRESHOLD_PX = 80;

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
    if (container && container.scrollTop > TOP_LOAD_THRESHOLD_PX) {
      paginationBlockedRef.current = false;
    }

    tryLoadOlder();
  }, [tryLoadOlder]);

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

export function mergeMessages(
  existing: ExportedMessage[],
  older: ExportedMessage[],
): { messages: ExportedMessage[]; prependedCount: number } {
  const merged = [...older, ...existing];
  const seen = new Set<number>();
  const result: ExportedMessage[] = [];

  for (const message of merged) {
    if (message.id != null) {
      if (seen.has(message.id)) {
        continue;
      }
      seen.add(message.id);
    }
    result.push(message);
  }

  const messages = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prependedCount = Math.max(0, messages.length - existing.length);

  return { messages, prependedCount };
}
