import { Alert, Select, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAccounts, fetchConversations, type Account, type ChatSummary } from '../api';
import ChatCard, { ChatListEmpty } from '../components/ChatCard';

export default function ChatListPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchAccounts();
        setAccounts(list);

        const active = list.find((entry) => entry.userId && !entry.expired);
        if (active?.userId) {
          setAccountId(active.userId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load accounts');
      }
    })();
  }, []);

  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchConversations(accountId);
        setChats(data.chats);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chats');
      } finally {
        setLoading(false);
      }
    })();
  }, [accountId]);

  const activeAccounts = accounts.filter((entry) => entry.userId && !entry.expired);

  return (
    <div className="chat-list">
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Чаты
      </Typography.Title>

      {activeAccounts.length === 0 && !loading && (
        <Alert
          type="warning"
          showIcon
          message="Нет активных токенов"
          description="Получите токен: npm run vk:token -- --browser 1"
          style={{ marginBottom: 16 }}
        />
      )}

      {activeAccounts.length > 1 && (
        <Select
          style={{ width: '100%', marginBottom: 16 }}
          placeholder="Выберите аккаунт"
          value={accountId ?? undefined}
          onChange={setAccountId}
          options={activeAccounts.map((entry) => ({
            value: entry.userId!,
            label: entry.email ?? `user_id=${entry.userId}`,
          }))}
        />
      )}

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      )}

      {!loading && !error && chats.length === 0 && <ChatListEmpty />}

      {!loading &&
        chats.map((chat) => (
          <ChatCard
            key={chat.peerId}
            chat={chat}
            onClick={() => navigate(`/chat/${chat.peerId}?accountId=${accountId}&title=${encodeURIComponent(chat.title)}`)}
          />
        ))}
    </div>
  );
}
