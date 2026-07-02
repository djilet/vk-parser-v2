import { PushpinFilled, PushpinOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Card, Empty, Spin, Tooltip, Typography } from 'antd';
import type { ChatSummary } from '../api';

type ChatCardProps = {
  chat: ChatSummary;
  pinned?: boolean;
  onClick: () => void;
  onTogglePin?: (pinned: boolean) => void;
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

function chatAvatarIcon(peerType: string) {
  if (peerType === 'chat') {
    return <TeamOutlined />;
  }

  return <UserOutlined />;
}

export default function ChatCard({ chat, pinned = false, onClick, onTogglePin }: ChatCardProps) {
  const lastText = chat.lastMessage ? formatLastMessage(chat.lastMessage.text) : 'Нет сообщений';
  const prefix = chat.lastMessage?.out ? 'Вы: ' : '';

  return (
    <Card className={`chat-card${pinned ? ' chat-card-pinned' : ''}`} size="small" onClick={onClick}>
      <div className="chat-card-body">
        <Avatar
          className="chat-card-avatar"
          src={chat.photoUrl}
          icon={chatAvatarIcon(chat.peerType)}
          size={48}
        />

        <div className="chat-card-content">
          <div className="chat-card-title">
            <div className="chat-card-title-main">
              {pinned && (
                <Tooltip title="Закреплён">
                  <PushpinFilled className="chat-card-pin-icon" />
                </Tooltip>
              )}
              <Typography.Text strong ellipsis>
                {chat.title}
              </Typography.Text>
            </div>
            <div className="chat-card-title-actions">
              {chat.unreadCount > 0 && <Badge count={chat.unreadCount} overflowCount={999} />}
              {onTogglePin && (
                <Tooltip title={pinned ? 'Открепить' : 'Закрепить'}>
                  <Button
                    type="text"
                    size="small"
                    className="chat-card-pin-button"
                    icon={pinned ? <PushpinFilled /> : <PushpinOutlined />}
                    aria-pressed={pinned}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTogglePin(!pinned);
                    }}
                  />
                </Tooltip>
              )}
            </div>
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
        </div>
      </div>
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

function mergeChatData(primary: ChatSummary, fallback?: ChatSummary): ChatSummary {
  if (!fallback) {
    return primary;
  }

  return {
    ...fallback,
    ...primary,
    lastMessage: primary.lastMessage ?? fallback.lastMessage,
    unreadCount: primary.unreadCount ?? fallback.unreadCount,
    photoUrl: primary.photoUrl ?? fallback.photoUrl,
    title: primary.title || fallback.title,
  };
}

export function buildChatList(
  chats: ChatSummary[],
  pinnedPeerIds: number[],
  pinnedChats: ChatSummary[],
): Array<{ chat: ChatSummary; pinned: boolean }> {
  const pinnedSet = new Set(pinnedPeerIds);
  const chatByPeerId = new Map<number, ChatSummary>();

  for (const chat of pinnedChats) {
    chatByPeerId.set(chat.peerId, chat);
  }

  for (const chat of chats) {
    chatByPeerId.set(chat.peerId, mergeChatData(chat, chatByPeerId.get(chat.peerId)));
  }

  const pinnedItems = pinnedPeerIds
    .map((peerId) => chatByPeerId.get(peerId))
    .filter((chat): chat is ChatSummary => chat != null)
    .map((chat) => ({ chat, pinned: true }));

  const unpinnedItems = chats
    .filter((chat) => !pinnedSet.has(chat.peerId))
    .map((chat) => ({ chat, pinned: false }));

  return [...pinnedItems, ...unpinnedItems];
}
