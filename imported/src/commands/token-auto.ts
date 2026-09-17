import { loadAllTokens, isTokenRefreshDue, markTokenNeedsSession } from '../token/store.js';
import { runTokenCommand } from './token.js';

export async function runTokenAutoCommand(): Promise<void> {
  const tokens = await loadAllTokens();

  if (tokens.length === 0) {
    return;
  }

  const dueTokens = tokens.filter((token) => isTokenRefreshDue(token));

  if (dueTokens.length === 0) {
    return;
  }

  console.log(
    `Автообновление токенов (${dueTokens.length}): браузеры ${dueTokens.map((token) => token.browserId).join(', ')}`,
  );

  for (const token of dueTokens) {
    try {
      await runTokenCommand(token.browserId, { headless: true });
      console.log(`Токен браузера #${token.browserId} обновлён`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markTokenNeedsSession(token.browserId);
      console.error(`Не удалось обновить токен браузера #${token.browserId}: ${message}`);
    }
  }
}
