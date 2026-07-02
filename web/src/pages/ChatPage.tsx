import { ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fetchMessages, sendMessage, type ExportedMessage } from '../api';
import MessageList from '../components/MessageList';

export default function ChatPage() {
  const navigate = useNavigate();
  const { peerId } = useParams();
  const [searchParams] = useSearchParams();

  const accountId = Number(searchParams.get('accountId'));
  const title = searchParams.get('title') ?? 'Чат';
  const numericPeerId = Number(peerId);

  const [messages, setMessages] = useState<ExportedMessage[]>([]);
  const [userId, setUserId] = useState<number>();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMessages() {
    if (!accountId || !numericPeerId) {
      setError('Invalid chat parameters');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchMessages(accountId, numericPeerId);
      setMessages(data.messages);
      setUserId(data.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, [accountId, numericPeerId]);

  async function handleSend() {
    const message = text.trim();
    if (!message || !accountId || !numericPeerId) return;

    setSending(true);
    setError(null);

    try {
      await sendMessage(accountId, numericPeerId, message);
      setText('');
      setMessages((prev) => [
        ...prev,
        {
          date: new Date().toISOString(),
          fromId: userId ?? accountId,
          text: message,
          files: [],
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} />
        <Typography.Title level={5} style={{ margin: 0 }} ellipsis>
          {title}
        </Typography.Title>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ margin: 16 }} />}

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : (
        <MessageList messages={messages} userId={userId} />
      )}

      <div className="chat-input-bar">
        <div className="chat-input-row">
          <Input.TextArea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Сообщение..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            disabled={sending}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={sending}
            onClick={() => void handleSend()}
            disabled={!text.trim()}
          >
            Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}
