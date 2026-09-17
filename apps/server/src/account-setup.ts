import { runSessionCommand, runTokenCommand, type BrowserId, type EnvConfig } from '@vk-sales-bot/core';
import type { AccountSetupStatus } from '@vk-sales-bot/contracts';
import { syncLongPollAccounts } from './long-poll-manager.js';

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

export function startSessionSetup(
  browserId: BrowserId,
  env: Pick<EnvConfig, 'vk'>,
): { started: boolean; error?: string } {
  const state = getState(browserId);

  if (state.session.status === 'running') {
    return { started: false, error: 'Session setup is already running' };
  }

  state.session = { status: 'running' };

  void runSessionCommand({ browserId, env })
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

export function startTokenSetup(
  browserId: BrowserId,
  env: Pick<EnvConfig, 'vk'>,
): { started: boolean; error?: string } {
  const state = getState(browserId);

  if (state.token.status === 'running') {
    return { started: false, error: 'Token setup is already running' };
  }

  state.token = { status: 'running' };

  void runTokenCommand({ browserId, env, headless: false })
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
