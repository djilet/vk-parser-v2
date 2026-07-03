import { ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Spin, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fetchMessages, sendMessage, suggestReply, type ExportedMessage } from '../api';
import MessageList, { mergeMessages } from '../components/MessageList';

const MESSAGE_PAGE_SIZE = 50;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [stickToBottom, setStickToBottom] = useState(false);
  const [paginationReady, setPaginationReady] = useState(false);
  const [scrollAnchorIndex, setScrollAnchorIndex] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);

  const loadLatestMessages = useCallback(async () => {
    if (!accountId || !numericPeerId) {
      setError('Invalid chat parameters');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setPaginationReady(false);

    try {
      const data = await fetchMessages(accountId, numericPeerId, {
        limit: MESSAGE_PAGE_SIZE,
        offset: 0,
      });

      setMessages(data.messages);
      setUserId(data.userId);
      setHasMore(data.hasMore);
      setNextOffset(data.messages.length);
      setStickToBottom(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [accountId, numericPeerId]);

  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    setNextOffset(0);
    setPaginationReady(false);
    setScrollAnchorIndex(null);
    void loadLatestMessages();
  }, [loadLatestMessages]);

  const loadOlderMessages = useCallback(async () => {
    if (!accountId || !numericPeerId || !hasMore || loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);

    try {
      const data = await fetchMessages(accountId, numericPeerId, {
        limit: MESSAGE_PAGE_SIZE,
        offset: nextOffset,
      });

      setMessages((prev) => {
        const { messages: merged, prependedCount } = mergeMessages(prev, data.messages);
        if (prependedCount > 0) {
          setScrollAnchorIndex(prependedCount);
        }
        return merged;
      });
      setHasMore(data.hasMore);
      setNextOffset((prev) => prev + data.messages.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load older messages');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [accountId, numericPeerId, hasMore, nextOffset]);

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
      setStickToBottom(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function handleSuggestReply() {
    if (!accountId || !numericPeerId || messages.length === 0) return;

    setGenerating(true);
    setError(null);

    try {
      const lastMessages = messages.slice(-MESSAGE_PAGE_SIZE);
      const data = await suggestReply(accountId, numericPeerId, lastMessages);
      setText(data.suggestion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate reply');
    } finally {
      setGenerating(false);
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
        <MessageList
          messages={messages}
          userId={userId}
          loadingMore={loadingMore}
          hasMore={hasMore}
          paginationReady={paginationReady}
          stickToBottom={stickToBottom}
          scrollAnchorIndex={scrollAnchorIndex}
          onStickToBottomApplied={() => {
            setStickToBottom(false);
            requestAnimationFrame(() => setPaginationReady(true));
          }}
          onScrollAnchorApplied={() => setScrollAnchorIndex(null)}
          onLoadOlder={() => void loadOlderMessages()}
        />
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
            disabled={sending || generating}
          />
          <Button
            onClick={() => void handleSuggestReply()}
            loading={generating}
            disabled={loading || sending || generating || messages.length === 0}
          >
            AI
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={sending}
            onClick={() => void handleSend()}
            disabled={!text.trim() || generating}
          >
            Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}
