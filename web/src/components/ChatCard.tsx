import { Badge, Card, Empty, Spin, Typography } from 'antd';
import type { ChatSummary } from '../api';

type ChatCardProps = {
  chat: ChatSummary;
  onClick: () => void;
};

function formatLastMessage(text: string): string {
  const trimmed = text.trim();
  return trimmed || 'Вложение';
}

function formatTime(date: string): string {
  return new Date(date).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChatCard({ chat, onClick }: ChatCardProps) {
  const lastText = chat.lastMessage ? formatLastMessage(chat.lastMessage.text) : 'Нет сообщений';
  const prefix = chat.lastMessage?.out ? 'Вы: ' : '';

  return (
    <Card className="chat-card" size="small" onClick={onClick}>
      <div className="chat-card-title">
        <Typography.Text strong ellipsis>
          {chat.title}
        </Typography.Text>
        {chat.unreadCount > 0 && <Badge count={chat.unreadCount} overflowCount={999} />}
      </div>
      <div className="chat-card-last-message">
        {prefix}
        {lastText}
      </div>
      {chat.lastMessage && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {formatTime(chat.lastMessage.date)}
        </Typography.Text>
      )}
    </Card>
  );
}

export function ChatCardSkeleton() {
  return (
    <Card className="chat-card" size="small">
      <Spin size="small" />
    </Card>
  );
}

export function ChatListEmpty() {
  return <Empty description="Нет чатов" />;
}
