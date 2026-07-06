import { Alert } from 'antd';
import type { Account } from '../api';

function sessionCommand(browserId: number): string {
  return `npm run vk:session -- --browser ${browserId}`;
}

function tokenCommand(browserId: number): string {
  return `npm run vk:token -- --browser ${browserId}`;
}

function CommandList({ commands }: { commands: string[] }) {
  return (
    <div className="token-setup-commands">
      {commands.map((command) => (
        <code key={command}>{command}</code>
      ))}
    </div>
  );
}

export function isAccountActive(account: Account | undefined): boolean {
  return Boolean(account?.userId && !account.expired && !account.needsSession);
}

export function TokenSetupAlert({
  browserId,
  variant,
}: {
  browserId: number;
  variant: 'missing' | 'invalid' | 'expired';
}) {
  if (variant === 'expired') {
    return (
      <Alert
        type="warning"
        showIcon
        message="Токен истёк"
        description={
          <>
            <div>Токен обновится автоматически при следующем запуске. Или обновите вручную:</div>
            <CommandList commands={[tokenCommand(browserId)]} />
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
          <CommandList commands={[sessionCommand(browserId), tokenCommand(browserId)]} />
        </>
      }
    />
  );
}
