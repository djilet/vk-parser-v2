import { Alert, Spin } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchAccountSetupStatus,
  startAccountSession,
  startAccountToken,
  type AccountSetupStatus,
  type SetupJobStatus,
} from '../api';
import type { Account } from '../api';

type SetupAction = 'session' | 'token';

function sessionCommand(browserId: number): string {
  return `npm run vk:session -- --browser ${browserId}`;
}

function tokenCommand(browserId: number): string {
  return `npm run vk:token -- --browser ${browserId}`;
}

function isJobRunning(status: SetupJobStatus | undefined): boolean {
  return status === 'running';
}

function CommandButton({
  command,
  loading,
  disabled,
  onClick,
}: {
  command: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="token-setup-command-btn"
      disabled={disabled || loading}
      onClick={onClick}
    >
      <code>{command}</code>
      {loading && <Spin size="small" />}
    </button>
  );
}

function CommandList({
  browserId,
  commands,
  setupStatus,
  runningAction,
  disabled,
  onRun,
}: {
  browserId: number;
  commands: SetupAction[];
  setupStatus: AccountSetupStatus | null;
  runningAction: SetupAction | null;
  disabled: boolean;
  onRun: (action: SetupAction) => void;
}) {
  const labels: Record<SetupAction, string> = {
    session: sessionCommand(browserId),
    token: tokenCommand(browserId),
  };

  return (
    <div className="token-setup-commands">
      {commands.map((action) => (
        <CommandButton
          key={action}
          command={labels[action]}
          loading={
            runningAction === action ||
            (action === 'token' && isJobRunning(setupStatus?.token.status))
          }
          disabled={disabled}
          onClick={() => onRun(action)}
        />
      ))}
    </div>
  );
}

export function isAccountActive(
  account: Account | undefined,
): account is Account & { userId: number } {
  return Boolean(account?.userId && !account.expired && !account.needsSession);
}

export function TokenSetupAlert({
  browserId,
  variant,
  onSetupComplete,
}: {
  browserId: number;
  variant: 'missing' | 'invalid' | 'expired';
  onSetupComplete?: () => void;
}) {
  const [setupStatus, setSetupStatus] = useState<AccountSetupStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<SetupAction | null>(null);
  const [tokenPolling, setTokenPolling] = useState(false);

  const refreshSetupStatus = useCallback(async () => {
    const status = await fetchAccountSetupStatus(browserId);
    setSetupStatus(status);
    return status;
  }, [browserId]);

  useEffect(() => {
    void refreshSetupStatus().catch(() => {
      // ignore initial status load errors
    });
  }, [refreshSetupStatus]);

  useEffect(() => {
    const tokenRunning = isJobRunning(setupStatus?.token.status);

    if (!tokenPolling && !tokenRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshSetupStatus()
        .then((status) => {
          if (!isJobRunning(status.token.status)) {
            setTokenPolling(false);
          }

          if (status.token.status === 'succeeded') {
            onSetupComplete?.();
          }

          if (status.session.status === 'failed' && status.session.error) {
            setActionError(status.session.error);
          }

          if (status.token.status === 'failed' && status.token.error) {
            setActionError(status.token.error);
          }
        })
        .catch((error: unknown) => {
          setTokenPolling(false);
          setActionError(error instanceof Error ? error.message : 'Failed to check setup status');
        });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [tokenPolling, setupStatus?.token.status, refreshSetupStatus, onSetupComplete]);

  const tokenRunning = isJobRunning(setupStatus?.token.status);

  async function handleRun(action: SetupAction) {
    setActionError(null);
    setRunningAction(action);

    try {
      if (action === 'session') {
        await startAccountSession(browserId);
      } else {
        setTokenPolling(true);
        await startAccountToken(browserId);
      }

      await refreshSetupStatus();
    } catch (error) {
      setTokenPolling(false);
      setActionError(error instanceof Error ? error.message : 'Failed to start command');
    } finally {
      setRunningAction(null);
    }
  }

  const sessionHint =
    setupStatus?.session.status === 'succeeded' ? (
      <div className="token-setup-hint">Браузер открыт. Войдите в VK, затем получите токен.</div>
    ) : null;

  const tokenHint =
    setupStatus?.token.status === 'running' ? (
      <div className="token-setup-hint">Получение токена… Следуйте шагам в открывшемся браузере.</div>
    ) : null;

  if (variant === 'expired') {
    return (
      <Alert
        type="warning"
        showIcon
        message="Токен истёк"
        description={
          <>
            <div>Токен обновится автоматически при следующем запуске. Или обновите вручную:</div>
            <CommandList
              browserId={browserId}
              commands={['token']}
              setupStatus={setupStatus}
              runningAction={runningAction}
              disabled={tokenRunning}
              onRun={handleRun}
            />
            {tokenHint}
            {actionError && <div className="token-setup-error">{actionError}</div>}
          </>
        }
      />
    );
  }

  const message = variant === 'missing' ? 'Токен не найден' : 'Токен недействителен';

  return (
    <Alert
      type="warning"
      showIcon
      message={message}
      description={
        <>
          <div>Автообновление недоступно. Сначала войдите в VK, затем получите токен:</div>
          <CommandList
            browserId={browserId}
            commands={['session', 'token']}
            setupStatus={setupStatus}
            runningAction={runningAction}
            disabled={tokenRunning}
            onRun={handleRun}
          />
          {sessionHint}
          {tokenHint}
          {actionError && <div className="token-setup-error">{actionError}</div>}
        </>
      }
    />
  );
}
