import { useEffect, useRef } from 'react';
import type { ExportedMessage } from '../api';

type MessageListProps = {
  messages: ExportedMessage[];
  userId?: number;
};

function formatMessageTime(date: string): string {
  return new Date(date).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessageList({ messages, userId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-messages">
      {messages.map((message, index) => {
        const outgoing = userId != null ? message.fromId === userId : false;

        return (
          <div
            key={`${message.date}-${message.fromId}-${index}`}
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
      <div ref={bottomRef} />
    </div>
  );
}
