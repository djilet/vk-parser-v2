import { type BrowserId } from '../config.js';
import { getAccessToken, loadAllTokens, loadToken, formatTokenStatus } from '../token/store.js';

export async function runListTokensCommand(): Promise<void> {
  const tokens = await loadAllTokens();

  if (tokens.length === 0) {
    console.log('Сохранённых токенов нет.');
    console.log('Получите токен: npm run vk:token -- --browser 1');
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

export async function runShowTokenCommand(browserId: BrowserId, showFull = false): Promise<void> {
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

export async function runGetTokenCommand(browserId: BrowserId): Promise<void> {
  const accessToken = await getAccessToken(browserId);
  console.log(accessToken);
}
