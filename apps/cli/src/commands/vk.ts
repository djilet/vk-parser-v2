import { rm } from 'node:fs/promises';
import {
  formatTokenStatus,
  getAccessToken,
  getBrowserPaths,
  loadAllTokens,
  loadToken,
  parseBrowserId,
  runAllTokensCommand,
  runSessionCommand,
  runTokenAutoCommand,
  runTokenCommand,
  type BrowserId,
  type EnvConfig,
} from '@vk-sales-bot/core';

export async function runVkSessionCommand(env: EnvConfig, browser: string | undefined): Promise<void> {
  await runSessionCommand({ browserId: parseBrowserId(browser), env });
}

export async function runVkTokenCommand(env: EnvConfig, browser: string | undefined, headless?: boolean): Promise<void> {
  await runTokenCommand({ browserId: parseBrowserId(browser), env, headless });
}

export async function runVkTokenAllCommand(env: EnvConfig): Promise<void> {
  await runAllTokensCommand(env);
}

export async function runVkTokenAutoCommand(env: EnvConfig): Promise<void> {
  await runTokenAutoCommand(env);
}

export async function runVkListCommand(): Promise<void> {
  const tokens = await loadAllTokens();

  if (tokens.length === 0) {
    console.log('Сохранённых токенов нет.');
    console.log('Получите токен: vk-sales-bot vk token --browser 1');
    return;
  }

  console.log('Сохранённые токены:\n');

  for (const token of tokens) {
    console.log(`#${token.browserId}`);
    console.log(`  ${formatTokenStatus(token)}`);
    console.log(`  файл: tokens/browser-${token.browserId}.json`);
    console.log(`  access_token: ${token.accessToken}`);
    console.log('');
  }
}

export async function runVkShowCommand(browser: string | undefined, showFull = false): Promise<void> {
  const browserId: BrowserId = parseBrowserId(browser);
  const token = await loadToken(browserId);

  if (!token) {
    throw new Error(`Токен для браузера #${browserId} не найден`);
  }

  console.log(formatTokenStatus(token));
  console.log('savedAt:', token.savedAt);
  if (token.expiresAt) console.log('expiresAt:', token.expiresAt);
  if (token.userId) console.log('user_id:', token.userId);
  if (token.email) console.log('email:', token.email);
  console.log('access_token:', showFull ? token.accessToken : `${token.accessToken.slice(0, 24)}...`);
}

export async function runVkGetCommand(browser: string | undefined): Promise<void> {
  const accessToken = await getAccessToken(parseBrowserId(browser));
  console.log(accessToken);
}

async function removeIfExists(path: string, label: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
    console.log(`Удалено: ${label} (${path})`);
  } catch (error) {
    console.error(`Не удалось удалить ${label} (${path}): ${error instanceof Error ? error.message : error}`);
  }
}

export type ClearSessionOptions = { browser?: string; yes?: boolean };

export async function runVkClearSessionCommand(options: ClearSessionOptions): Promise<void> {
  const browserId: BrowserId = parseBrowserId(options.browser);

  if (!options.yes) {
    throw new Error(
      `Это удалит логин-сессию браузера #${browserId} без возможности отмены. ` +
        `Повторите с --yes, чтобы подтвердить: vk-sales-bot vk clear-session --browser ${browserId} --yes`,
    );
  }

  const { browserProfile, tokenFile } = getBrowserPaths(browserId);

  console.log(`Очищаю сессию браузера #${browserId}`);
  console.log(`Профиль Chrome: ${browserProfile}`);
  console.log(`Токен VK: ${tokenFile}`);
  console.log('');

  await removeIfExists(browserProfile, 'профиль Chrome');
  await removeIfExists(tokenFile, 'токен VK');

  console.log(`\nГотово. Для повторного входа: vk-sales-bot vk session --browser ${browserId}`);
}
