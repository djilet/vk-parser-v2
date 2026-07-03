import { Alert, Badge, Spin, Tabs, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAccounts, fetchConversations, fetchPinnedConversations, fetchPinnedPeerIds, setChatPinned, type Account, type ChatSummary } from '../api';
import ChatCard, { buildChatList, ChatListEmpty } from '../components/ChatCard';

const BROWSER_IDS = [1, 2] as const;
const PAGE_SIZE = 50;

type BrowserChatsState = {
  chats: ChatSummary[];
  loading: boolean;
  loadingMore: boolean;
  loaded: boolean;
  error: string | null;
  total: number;
  nextOffset: number;
  hasMore: boolean;
  unreadChatCount: number;
};

function emptyBrowserState(): BrowserChatsState {
  return {
    chats: [],
    loading: false,
    loadingMore: false,
    loaded: false,
    error: null,
    total: 0,
    nextOffset: 0,
    hasMore: false,
    unreadChatCount: 0,
  };
}

function tabLabel(browserId: number, account: Account | undefined): string {
  if (account?.firstName || account?.lastName) {
    return `${account.firstName ?? ''} ${account.lastName ?? ''}`.trim();
  }

  if (account?.email) {
    return account.email;
  }

  return `Токен ${browserId}`;
}

function hasMoreChats(batchSize: number, offset: number, total: number | undefined): boolean {
  const nextOffset = offset + batchSize;

  if (batchSize === 0) {
    return false;
  }

  if (batchSize < PAGE_SIZE) {
    return false;
  }

  if (total == null) {
    return true;
  }

  return nextOffset < total;
}

function BrowserTabContent({
  browserId,
  account,
  state,
  pinnedPeerIds,
  pinnedChats,
  onOpenChat,
  onLoadMore,
  onTogglePin,
}: {
  browserId: number;
  account: Account | undefined;
  state: BrowserChatsState;
  pinnedPeerIds: number[];
  pinnedChats: ChatSummary[];
  onOpenChat: (chat: ChatSummary, accountId: number) => void;
  onLoadMore: () => void;
  onTogglePin: (peerId: number, pinned: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.loaded || !state.hasMore || state.loading || state.loadingMore) {
      return;
    }

    const scrollRoot = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!scrollRoot || !sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { root: scrollRoot, rootMargin: '120px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [state.loaded, state.hasMore, state.loading, state.loadingMore, state.chats.length, onLoadMore]);

  if (!account?.userId) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Токен не найден"
        description={`Получите токен: npm run vk:token -- --browser ${browserId}`}
      />
    );
  }

  if (account.expired) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Токен истёк"
        description={`Обновите токен: npm run vk:token -- --browser ${browserId}`}
      />
    );
  }

  if (!state.loaded || (state.loading && state.chats.length === 0)) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (state.error && state.chats.length === 0) {
    return <Alert type="error" message={state.error} showIcon />;
  }

  if (state.total === 0 && pinnedPeerIds.length === 0) {
    return <ChatListEmpty />;
  }

  const visibleChats = buildChatList(state.chats, pinnedPeerIds, pinnedChats);

  return (
    <div className="chat-list-panel" ref={scrollRef}>
      {visibleChats.map(({ chat, pinned }) => (
        <ChatCard
          key={chat.peerId}
          chat={chat}
          pinned={pinned}
          onClick={() => onOpenChat(chat, account.userId!)}
          onTogglePin={(nextPinned) => onTogglePin(chat.peerId, nextPinned)}
        />
      ))}

      {state.loadingMore && (
        <div className="chat-list-load-more">
          <Spin />
        </div>
      )}

      {state.hasMore && <div ref={sentinelRef} className="chat-list-sentinel" aria-hidden />}

      {!state.hasMore && state.chats.length > 0 && (
        <Typography.Text type="secondary" className="chat-list-end">
          Загружено {state.chats.length} из {state.total}
        </Typography.Text>
      )}
    </div>
  );
}

export default function ChatListPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [activeBrowserId, setActiveBrowserId] = useState<number>(1);
  const [chatsByBrowser, setChatsByBrowser] = useState<Record<number, BrowserChatsState>>({
    1: emptyBrowserState(),
    2: emptyBrowserState(),
  });
  const [pinnedPeerIdsByBrowser, setPinnedPeerIdsByBrowser] = useState<Record<number, number[]>>({
    1: [],
    2: [],
  });
  const [pinnedChatsByBrowser, setPinnedChatsByBrowser] = useState<Record<number, ChatSummary[]>>({
    1: [],
    2: [],
  });
  const loadingRef = useRef<Record<number, boolean>>({});

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchAccounts();
        setAccounts(list);

        const firstActive = BROWSER_IDS.find((browserId) => {
          const account = list.find((entry) => entry.browserId === browserId);
          return account?.userId && !account.expired;
        });

        if (firstActive) {
          setActiveBrowserId(firstActive);
        }
      } catch (err) {
        setAccountsError(err instanceof Error ? err.message : 'Failed to load accounts');
      } finally {
        setAccountsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (accountsLoading) {
      return;
    }

    void (async () => {
      await Promise.all(
        BROWSER_IDS.map(async (browserId) => {
          const account = accounts.find((entry) => entry.browserId === browserId);

          if (!account?.userId || account.expired) {
            setChatsByBrowser((prev) => ({
              ...prev,
              [browserId]: emptyBrowserState(),
            }));
            return;
          }

          try {
            const data = await fetchConversations(account.userId, {
              limit: 1,
              offset: 0,
              filter: 'unread',
            });

            setChatsByBrowser((prev) => ({
              ...prev,
              [browserId]: {
                ...prev[browserId],
                unreadChatCount: data.total,
              },
            }));
          } catch {
            setChatsByBrowser((prev) => ({
              ...prev,
              [browserId]: {
                ...prev[browserId],
                unreadChatCount: 0,
              },
            }));
          }
        }),
      );
    })();
  }, [accounts, accountsLoading]);

  const loadPinnedChats = useCallback(async (browserId: number) => {
    const account = accounts.find((entry) => entry.browserId === browserId);
    if (!account?.userId || account.expired) {
      setPinnedPeerIdsByBrowser((prev) => ({ ...prev, [browserId]: [] }));
      setPinnedChatsByBrowser((prev) => ({ ...prev, [browserId]: [] }));
      return;
    }

    try {
      const [peerIdsData, conversationsData] = await Promise.all([
        fetchPinnedPeerIds(account.userId),
        fetchPinnedConversations(account.userId),
      ]);

      setPinnedPeerIdsByBrowser((prev) => ({
        ...prev,
        [browserId]: peerIdsData.peerIds,
      }));
      setPinnedChatsByBrowser((prev) => ({
        ...prev,
        [browserId]: conversationsData.chats,
      }));
    } catch {
      setPinnedPeerIdsByBrowser((prev) => ({ ...prev, [browserId]: [] }));
      setPinnedChatsByBrowser((prev) => ({ ...prev, [browserId]: [] }));
    }
  }, [accounts]);

  useEffect(() => {
    if (accountsLoading) {
      return;
    }

    void Promise.all(BROWSER_IDS.map((browserId) => loadPinnedChats(browserId)));
  }, [accounts, accountsLoading, loadPinnedChats]);

  const loadChats = useCallback(async (browserId: number, offset: number) => {
    if (loadingRef.current[browserId]) {
      return;
    }

    const account = accounts.find((entry) => entry.browserId === browserId);
    if (!account?.userId || account.expired) {
      return;
    }

    const append = offset > 0;
    const userId = account.userId;

    let canLoad = true;
    setChatsByBrowser((prev) => {
      const state = prev[browserId];
      if (append && (!state.hasMore || state.loading || state.loadingMore)) {
        canLoad = false;
        return prev;
      }

      return {
        ...prev,
        [browserId]: {
          ...state,
          loading: !append,
          loadingMore: append,
          error: null,
        },
      };
    });

    if (!canLoad) {
      return;
    }

    loadingRef.current[browserId] = true;

    try {
      const data = await fetchConversations(userId, {
        limit: PAGE_SIZE,
        offset,
      });

      setChatsByBrowser((prev) => {
        const existing = append ? prev[browserId].chats : [];
        const merged = [...existing, ...data.chats];
        const seen = new Set<number>();
        const chats = merged.filter((chat) => {
          if (seen.has(chat.peerId)) {
            return false;
          }
          seen.add(chat.peerId);
          return true;
        });
        const nextOffset = offset + data.chats.length;
        const total = data.total ?? chats.length;

        return {
          ...prev,
          [browserId]: {
            ...prev[browserId],
            chats,
            total,
            nextOffset,
            hasMore: hasMoreChats(data.chats.length, offset, data.total),
            loading: false,
            loadingMore: false,
            loaded: true,
            error: null,
          },
        };
      });
    } catch (err) {
      setChatsByBrowser((prev) => ({
        ...prev,
        [browserId]: {
          ...prev[browserId],
          loading: false,
          loadingMore: false,
          loaded: true,
          error: err instanceof Error ? err.message : 'Failed to load chats',
        },
      }));
    } finally {
      loadingRef.current[browserId] = false;
    }
  }, [accounts]);

  useEffect(() => {
    if (accountsLoading) {
      return;
    }

    const state = chatsByBrowser[activeBrowserId];
    if (state.loaded || state.loading) {
      return;
    }

    void loadChats(activeBrowserId, 0);
  }, [accountsLoading, activeBrowserId, chatsByBrowser, loadChats]);

  const handleLoadMore = useCallback(
    (browserId: number) => {
      const state = chatsByBrowser[browserId];
      if (!state.hasMore || state.loading || state.loadingMore) {
        return;
      }

      void loadChats(browserId, state.nextOffset);
    },
    [chatsByBrowser, loadChats],
  );

  const handleTogglePin = useCallback(
    async (browserId: number, peerId: number, pinned: boolean) => {
      const account = accounts.find((entry) => entry.browserId === browserId);
      if (!account?.userId) {
        return;
      }

      try {
        const result = await setChatPinned(account.userId, peerId, pinned);
        setPinnedPeerIdsByBrowser((prev) => ({
          ...prev,
          [browserId]: result.peerIds,
        }));
        await loadPinnedChats(browserId);
      } catch {
        // keep current state on failure
      }
    },
    [accounts, loadPinnedChats],
  );

  function openChat(chat: ChatSummary, accountId: number) {
    const params = new URLSearchParams({
      accountId: String(accountId),
      title: chat.title,
      unreadCount: String(chat.unreadCount),
    });

    navigate(`/chat/${chat.peerId}?${params}`);
  }

  const hasAnyActiveAccount = BROWSER_IDS.some((browserId) => {
    const account = accounts.find((entry) => entry.browserId === browserId);
    return account?.userId && !account.expired;
  });

  return (
    <div className="chat-list">
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Чаты
      </Typography.Title>

      {accountsError && (
        <Alert type="error" message={accountsError} showIcon style={{ marginBottom: 16 }} />
      )}

      {!accountsLoading && !hasAnyActiveAccount && (
        <Alert
          type="warning"
          showIcon
          message="Нет активных токенов"
          description="Получите токен: npm run vk:token -- --browser 1"
          style={{ marginBottom: 16 }}
        />
      )}

      {accountsLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Tabs
          activeKey={String(activeBrowserId)}
          onChange={(key) => setActiveBrowserId(Number(key))}
          items={BROWSER_IDS.map((browserId) => {
            const account = accounts.find((entry) => entry.browserId === browserId);
            const state = chatsByBrowser[browserId];

            return {
              key: String(browserId),
              label: (
                <Badge count={state.unreadChatCount} offset={[8, -2]} size="small">
                  <span className="chat-list-tab-label">{tabLabel(browserId, account)}</span>
                </Badge>
              ),
              children: (
                <BrowserTabContent
                  browserId={browserId}
                  account={account}
                  state={state}
                  pinnedPeerIds={pinnedPeerIdsByBrowser[browserId]}
                  pinnedChats={pinnedChatsByBrowser[browserId]}
                  onOpenChat={openChat}
                  onLoadMore={() => handleLoadMore(browserId)}
                  onTogglePin={(peerId, pinned) => void handleTogglePin(browserId, peerId, pinned)}
                />
              ),
            };
          })}
        />
      )}
    </div>
  );
}
