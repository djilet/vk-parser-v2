import { runSessionCommand } from '../src/commands/session.js';
import { runTokenCommand } from '../src/commands/token.js';
import { type BrowserId } from '../src/config.js';
import { syncLongPollAccounts } from './long-poll-manager.js';

export type SetupJobStatus = 'idle' | 'running' | 'succeeded' | 'failed';

export type SetupJobState = {
  status: SetupJobStatus;
  error?: string;
};

export type AccountSetupStatus = {
  session: SetupJobState;
  token: SetupJobState;
};

const setupState = new Map<number, AccountSetupStatus>();

function getState(browserId: BrowserId): AccountSetupStatus {
  const existing = setupState.get(browserId);
  if (existing) {
    return existing;
  }

  const initial: AccountSetupStatus = {
    session: { status: 'idle' },
    token: { status: 'idle' },
  };

  setupState.set(browserId, initial);
  return initial;
}

export function getAccountSetupStatus(browserId: BrowserId): AccountSetupStatus {
  return getState(browserId);
}

export function startSessionSetup(browserId: BrowserId): { started: boolean; error?: string } {
  const state = getState(browserId);

  void runSessionCommand(browserId)
    .then(() => {
      state.session = { status: 'succeeded' };
    })
    .catch((error: unknown) => {
      state.session = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    });

  return { started: true };
}

export function startTokenSetup(browserId: BrowserId): { started: boolean; error?: string } {
  const state = getState(browserId);

  if (state.token.status === 'running') {
    return { started: false, error: 'Token setup is already running' };
  }

  state.token = { status: 'running' };

  void runTokenCommand(browserId, { headless: false })
    .then(() => {
      state.token = { status: 'succeeded' };
      syncLongPollAccounts();
    })
    .catch((error: unknown) => {
      state.token = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    });

  return { started: true };
}
