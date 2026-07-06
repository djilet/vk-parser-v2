import { Alert, Badge, Empty, Spin, Tabs, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAccounts, fetchChatStatuses, fetchConversations, fetchPinnedConversations, fetchPinnedPeerIds, fetchStatusConversations, setChatPinned, setChatStatus, CHAT_STATUS_OPTIONS, TAGGED_CHAT_STATUSES, type Account, type ChatStatus, type ChatSummary, type SseEvent, type TaggedChatStatus, DEFAULT_CHAT_STATUS } from '../api';
import ChatCard, { buildChatList, ChatListEmpty } from '../components/ChatCard';
import { isAccountActive, TokenSetupAlert } from '../components/TokenSetupAlert';
import { useSseEvents } from '../context/SseProvider';
import { ThemeSwitcher } from '../context/ThemeProvider';
import { countUnreadChatsByStatus, filterInitialChats, filterPinnedForStatus, findBrowserIdForAccount, isTaggedChatStatus, removeChatByPeerId, resolveChatStatus, upsertChat, upsertPinnedChat } from '../utils/chats';

const BROWSER_IDS = [1, 2] as const;
const PAGE_SIZE = 50;
const DEFAULT_DOCUMENT_TITLE = 'VK Chats';

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

type TaggedStatusChatsState = {
  chats: ChatSummary[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
};

function emptyTaggedStatusState(): TaggedStatusChatsState {
  return {
    chats: [],
    loading: false,
    loaded: false,
    error: null,
  };
}

function emptyTaggedStatusChatsState(): Record<TaggedChatStatus, TaggedStatusChatsState> {
  return {
    active_dialog: emptyTaggedStatusState(),
    client: emptyTaggedStatusState(),
  };
}

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
  chatStatuses,
  statusChats,
  activeStatusTab,
  onStatusTabChange,
  onOpenChat,
  onLoadMore,
  onTogglePin,
  onStatusChange,
}: {
  browserId: number;
  account: Account | undefined;
  state: BrowserChatsState;
  pinnedPeerIds: number[];
  pinnedChats: ChatSummary[];
  chatStatuses: Record<number, ChatStatus>;
  statusChats: Record<TaggedChatStatus, TaggedStatusChatsState>;
  activeStatusTab: ChatStatus;
  onStatusTabChange: (status: ChatStatus) => void;
  onOpenChat: (chat: ChatSummary, accountId: number) => void;
  onLoadMore: () => void;
  onTogglePin: (peerId: number, pinned: boolean) => void;
  onStatusChange: (peerId: number, status: ChatStatus) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isInitialTab = activeStatusTab === DEFAULT_CHAT_STATUS;
  const taggedStatusState = isInitialTab ? null : statusChats[activeStatusTab as TaggedChatStatus];

  useEffect(() => {
    if (!isInitialTab || !state.loaded || !state.hasMore || state.loading || state.loadingMore) {
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
  }, [isInitialTab, state.loaded, state.hasMore, state.loading, state.loadingMore, state.chats.length, onLoadMore]);

  if (!account?.userId) {
    return <TokenSetupAlert browserId={browserId} variant="missing" />;
  }

  if (account.needsSession) {
    return <TokenSetupAlert browserId={browserId} variant="invalid" />;
  }

  if (account.expired) {
    return <TokenSetupAlert browserId={browserId} variant="expired" />;
  }

  if (isInitialTab) {
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
  } else if (taggedStatusState && (!taggedStatusState.loaded || (taggedStatusState.loading && taggedStatusState.chats.length === 0))) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  } else if (taggedStatusState?.error && taggedStatusState.chats.length === 0) {
    return <Alert type="error" message={taggedStatusState.error} showIcon />;
  }

  const initialPinned = filterPinnedForStatus(
    pinnedPeerIds,
    pinnedChats,
    DEFAULT_CHAT_STATUS,
    chatStatuses,
  );
  const initialItems = buildChatList(
    filterInitialChats(state.chats, chatStatuses),
    initialPinned.peerIds,
    initialPinned.chats,
  );

  const dialogPinned = filterPinnedForStatus(
    pinnedPeerIds,
    pinnedChats,
    'active_dialog',
    chatStatuses,
  );
  const dialogItems = buildChatList(
    statusChats.active_dialog.chats,
    dialogPinned.peerIds,
    dialogPinned.chats,
  );

  const clientPinned = filterPinnedForStatus(
    pinnedPeerIds,
    pinnedChats,
    'client',
    chatStatuses,
  );
  const clientItems = buildChatList(
    statusChats.client.chats,
    clientPinned.peerIds,
    clientPinned.chats,
  );

  const unreadByStatus = countUnreadChatsByStatus({
    initial: initialItems.map(({ chat }) => chat),
    active_dialog: dialogItems.map(({ chat }) => chat),
    client: clientItems.map(({ chat }) => chat),
  });

  const visibleChats = isInitialTab
    ? initialItems
    : activeStatusTab === 'active_dialog'
      ? dialogItems
      : clientItems;

  const hasAnyChats =
    initialItems.length > 0 || dialogItems.length > 0 || clientItems.length > 0;

  if (!hasAnyChats && state.loaded && statusChats.active_dialog.loaded && statusChats.client.loaded) {
    return <ChatListEmpty />;
  }

  return (
    <>
      <Tabs
        className="chat-status-tabs"
        size="small"
        activeKey={activeStatusTab}
        onChange={(key) => onStatusTabChange(key as ChatStatus)}
        items={CHAT_STATUS_OPTIONS.map(({ value, label }) => ({
          key: value,
          label: (
            <Badge count={unreadByStatus[value]} offset={[8, -2]} size="small">
              <span className="chat-status-tab-label">{label}</span>
            </Badge>
          ),
        }))}
      />

      <div className="chat-list-panel" ref={scrollRef}>
        {visibleChats.length === 0 ? (
          <Empty description="Нет чатов в этой категории" />
        ) : (
          visibleChats.map(({ chat, pinned }) => (
            <ChatCard
              key={chat.peerId}
              chat={chat}
              pinned={pinned}
              status={chatStatuses[chat.peerId] ?? DEFAULT_CHAT_STATUS}
              onClick={() => onOpenChat(chat, account.userId!)}
              onTogglePin={(nextPinned) => onTogglePin(chat.peerId, nextPinned)}
              onStatusChange={(status) => onStatusChange(chat.peerId, status)}
            />
          ))
        )}

        {isInitialTab && state.loadingMore && (
          <div className="chat-list-load-more">
            <Spin />
          </div>
        )}

        {isInitialTab && state.hasMore && <div ref={sentinelRef} className="chat-list-sentinel" aria-hidden />}

        {isInitialTab && !state.hasMore && state.chats.length > 0 && (
          <Typography.Text type="secondary" className="chat-list-end">
            Загружено {state.chats.length} из {state.total}
          </Typography.Text>
        )}
      </div>
    </>
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
  const [chatStatusesByBrowser, setChatStatusesByBrowser] = useState<Record<number, Record<number, ChatStatus>>>({
    1: {},
    2: {},
  });
  const [activeStatusByBrowser, setActiveStatusByBrowser] = useState<Record<number, ChatStatus>>({
    1: DEFAULT_CHAT_STATUS,
    2: DEFAULT_CHAT_STATUS,
  });
  const [statusChatsByBrowser, setStatusChatsByBrowser] = useState<
    Record<number, Record<TaggedChatStatus, TaggedStatusChatsState>>
  >({
    1: emptyTaggedStatusChatsState(),
    2: emptyTaggedStatusChatsState(),
  });
  const loadingRef = useRef<Record<number, boolean>>({});
  const statusLoadingRef = useRef<Record<string, boolean>>({});
  const initialTabSetRef = useRef(false);
  const accountsRef = useRef(accounts);
  const chatStatusesRef = useRef(chatStatusesByBrowser);

  accountsRef.current = accounts;
  chatStatusesRef.current = chatStatusesByBrowser;

  const refreshUnreadCount = useCallback(async (browserId: number, account: Account) => {
    if (!isAccountActive(account)) {
      setChatsByBrowser((prev) => ({
        ...prev,
        [browserId]: {
          ...prev[browserId],
          unreadChatCount: 0,
        },
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
  }, []);

  const handleSseEvent = useCallback((event: SseEvent) => {
    const browserId = findBrowserIdForAccount(accountsRef.current, event.accountId);
    if (browserId == null) {
      return;
    }

    if (event.type === 'unread_count') {
      setChatsByBrowser((prev) => ({
        ...prev,
        [browserId]: {
          ...prev[browserId],
          unreadChatCount: event.count,
        },
      }));
      return;
    }

    if (event.type === 'chat.updated') {
      const statuses = chatStatusesRef.current[browserId] ?? {};
      const chatStatus = resolveChatStatus(event.chat.peerId, statuses);

      setChatsByBrowser((prev) => {
        const currentState = prev[browserId];
        if (!currentState.loaded) {
          return prev;
        }

        const isNewChat = !currentState.chats.some((chat) => chat.peerId === event.chat.peerId);

        return {
          ...prev,
          [browserId]: {
            ...currentState,
            chats: upsertChat(currentState.chats, event.chat),
            total: isNewChat ? Math.max(currentState.total, currentState.chats.length) + 1 : currentState.total,
          },
        };
      });

      setPinnedChatsByBrowser((prev) => ({
        ...prev,
        [browserId]: upsertPinnedChat(prev[browserId] ?? [], event.chat),
      }));

      setStatusChatsByBrowser((prev) => {
        const current = prev[browserId] ?? emptyTaggedStatusChatsState();
        const next = { ...current };

        for (const status of TAGGED_CHAT_STATUSES) {
          const stateForStatus = current[status];
          if (chatStatus === status) {
            next[status] = {
              ...stateForStatus,
              chats: upsertChat(stateForStatus.chats, event.chat),
            };
          } else {
            next[status] = {
              ...stateForStatus,
              chats: removeChatByPeerId(stateForStatus.chats, event.chat.peerId),
            };
          }
        }

        return {
          ...prev,
          [browserId]: next,
        };
      });
    }
  }, []);

  useSseEvents(handleSseEvent);

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchAccounts();
        setAccounts(list);

        const firstActive = BROWSER_IDS.find((browserId) => {
          const account = list.find((entry) => entry.browserId === browserId);
          return isAccountActive(account);
        });

        if (firstActive && !initialTabSetRef.current) {
          setActiveBrowserId(firstActive);
          initialTabSetRef.current = true;
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

    for (const browserId of BROWSER_IDS) {
      const account = accounts.find((entry) => entry.browserId === browserId);
      if (!isAccountActive(account)) {
        setChatsByBrowser((prev) => ({
          ...prev,
          [browserId]: emptyBrowserState(),
        }));
      }
    }

    void Promise.all(
      BROWSER_IDS.map((browserId) => {
        const account = accounts.find((entry) => entry.browserId === browserId);
        if (!account) {
          return Promise.resolve();
        }
        return refreshUnreadCount(browserId, account);
      }),
    );
  }, [accounts, accountsLoading, refreshUnreadCount]);

  useEffect(() => {
    const totalUnread = BROWSER_IDS.reduce(
      (sum, browserId) => sum + (chatsByBrowser[browserId]?.unreadChatCount ?? 0),
      0,
    );

    document.title = totalUnread > 0 ? `(${totalUnread}) ${DEFAULT_DOCUMENT_TITLE}` : DEFAULT_DOCUMENT_TITLE;
  }, [chatsByBrowser]);

  const loadPinnedChats = useCallback(async (browserId: number) => {
    const account = accounts.find((entry) => entry.browserId === browserId);
    if (!isAccountActive(account)) {
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

  const loadChatStatuses = useCallback(async (browserId: number) => {
    const account = accounts.find((entry) => entry.browserId === browserId);
    if (!isAccountActive(account)) {
      setChatStatusesByBrowser((prev) => ({ ...prev, [browserId]: {} }));
      return;
    }

    try {
      const data = await fetchChatStatuses(account.userId);
      setChatStatusesByBrowser((prev) => ({
        ...prev,
        [browserId]: data.statuses,
      }));
    } catch {
      setChatStatusesByBrowser((prev) => ({ ...prev, [browserId]: {} }));
    }
  }, [accounts]);

  const loadStatusChats = useCallback(async (browserId: number, status: TaggedChatStatus) => {
    const loadKey = `${browserId}:${status}`;
    if (statusLoadingRef.current[loadKey]) {
      return;
    }

    const account = accounts.find((entry) => entry.browserId === browserId);
    if (!isAccountActive(account)) {
      setStatusChatsByBrowser((prev) => ({
        ...prev,
        [browserId]: {
          ...prev[browserId],
          [status]: emptyTaggedStatusState(),
        },
      }));
      return;
    }

    statusLoadingRef.current[loadKey] = true;

    setStatusChatsByBrowser((prev) => ({
      ...prev,
      [browserId]: {
        ...prev[browserId],
        [status]: {
          ...prev[browserId][status],
          loading: true,
          error: null,
        },
      },
    }));

    try {
      const data = await fetchStatusConversations(account.userId, status);
      setStatusChatsByBrowser((prev) => ({
        ...prev,
        [browserId]: {
          ...prev[browserId],
          [status]: {
            chats: data.chats,
            loading: false,
            loaded: true,
            error: null,
          },
        },
      }));
    } catch (err) {
      setStatusChatsByBrowser((prev) => ({
        ...prev,
        [browserId]: {
          ...prev[browserId],
          [status]: {
            ...prev[browserId][status],
            loading: false,
            loaded: true,
            error: err instanceof Error ? err.message : 'Failed to load status chats',
          },
        },
      }));
    } finally {
      statusLoadingRef.current[loadKey] = false;
    }
  }, [accounts]);

  useEffect(() => {
    if (accountsLoading) {
      return;
    }

    void Promise.all(BROWSER_IDS.map((browserId) => loadPinnedChats(browserId)));
  }, [accounts, accountsLoading, loadPinnedChats]);

  useEffect(() => {
    if (accountsLoading) {
      return;
    }

    void Promise.all(BROWSER_IDS.map((browserId) => loadChatStatuses(browserId)));
  }, [accounts, accountsLoading, loadChatStatuses]);

  useEffect(() => {
    if (accountsLoading) {
      return;
    }

    void Promise.all(
      BROWSER_IDS.flatMap((browserId) =>
        TAGGED_CHAT_STATUSES.map((status) => loadStatusChats(browserId, status)),
      ),
    );
  }, [accounts, accountsLoading, loadStatusChats]);

  const loadChats = useCallback(async (browserId: number, offset: number) => {
    if (loadingRef.current[browserId]) {
      return;
    }

    const account = accounts.find((entry) => entry.browserId === browserId);
    if (!isAccountActive(account)) {
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

  const handleStatusChange = useCallback(
    async (browserId: number, peerId: number, status: ChatStatus) => {
      const account = accounts.find((entry) => entry.browserId === browserId);
      if (!account?.userId) {
        return;
      }

      const previousStatus = resolveChatStatus(
        peerId,
        chatStatusesByBrowser[browserId] ?? {},
      );

      setChatStatusesByBrowser((prev) => ({
        ...prev,
        [browserId]: {
          ...prev[browserId],
          [peerId]: status,
        },
      }));

      try {
        const result = await setChatStatus(account.userId, peerId, status);
        setChatStatusesByBrowser((prev) => ({
          ...prev,
          [browserId]: result.statuses,
        }));

        const statusesToReload = new Set<TaggedChatStatus>();
        if (isTaggedChatStatus(previousStatus)) {
          statusesToReload.add(previousStatus);
        }
        if (isTaggedChatStatus(status)) {
          statusesToReload.add(status);
        }

        await Promise.all(
          [...statusesToReload].map((entry) => loadStatusChats(browserId, entry)),
        );
      } catch {
        await loadChatStatuses(browserId);
        await Promise.all(
          TAGGED_CHAT_STATUSES.map((entry) => loadStatusChats(browserId, entry)),
        );
      }
    },
    [accounts, chatStatusesByBrowser, loadChatStatuses, loadStatusChats],
  );

  function openChat(chat: ChatSummary, accountId: number) {
    const params = new URLSearchParams({
      accountId: String(accountId),
      title: chat.title,
      unreadCount: String(chat.unreadCount),
    });

    navigate(`/chat/${chat.peerId}?${params}`);
  }

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <Typography.Title level={3} style={{ margin: 0 }}>
          Чаты
        </Typography.Title>
        <ThemeSwitcher />
      </div>

      {accountsError && (
        <Alert type="error" message={accountsError} showIcon style={{ marginBottom: 16 }} />
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
                  chatStatuses={chatStatusesByBrowser[browserId] ?? {}}
                  statusChats={statusChatsByBrowser[browserId] ?? emptyTaggedStatusChatsState()}
                  activeStatusTab={activeStatusByBrowser[browserId] ?? DEFAULT_CHAT_STATUS}
                  onStatusTabChange={(status) =>
                    setActiveStatusByBrowser((prev) => ({ ...prev, [browserId]: status }))
                  }
                  onOpenChat={openChat}
                  onLoadMore={() => handleLoadMore(browserId)}
                  onTogglePin={(peerId, pinned) => void handleTogglePin(browserId, peerId, pinned)}
                  onStatusChange={(peerId, status) => void handleStatusChange(browserId, peerId, status)}
                />
              ),
            };
          })}
        />
      )}
    </div>
  );
}
