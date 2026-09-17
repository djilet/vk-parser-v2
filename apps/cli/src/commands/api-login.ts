import { repoRoot, type EnvConfig } from '@vk-sales-bot/core';
import { resolve } from 'node:path';
import { ApiError, createSalesApiClient, readStoredToken } from '@vk-sales-bot/sales-api';

export type ApiLoginOptions = { force?: boolean };

/** Токен в лог не пишем целиком — только чтобы отличить один от другого. */
function maskToken(token: string): string {
  return `${token.slice(0, 12)}…${token.slice(-6)} (${token.length} символов)`;
}

export async function runApiLoginCommand(env: EnvConfig, options: ApiLoginOptions): Promise<void> {
  if (!env.api.baseUrl || !env.api.phone || !env.api.code) {
    throw new Error('API не настроен: задайте API_BASE_URL, API_PHONE и API_CODE в .env');
  }

  const api = createSalesApiClient(env.api);
  const tokenFile = resolve(repoRoot(), env.api.tokenFile);

  console.log(`API: ${env.api.baseUrl}`);
  console.log(`Телефон: ${env.api.phone}`);

  const stored = await readStoredToken({ phone: env.api.phone, tokenFile: env.api.tokenFile });

  try {
    let token: string;

    if (stored && !options.force) {
      // Сохранённый токен живёт год, поэтому по умолчанию не дёргаем выдачу кода лишний раз.
      token = await api.http.getToken();
      console.log(`\nИспользую сохранённый токен: ${tokenFile}`);
      console.log(`Токен: ${maskToken(token)}`);
      console.log('Чтобы войти заново, запустите с --force');
    } else {
      if (options.force && stored) {
        console.log('\n--force: игнорирую сохранённый токен');
      }

      console.log('\n1/2 Запрашиваю код: POST /users/get-temp-password-v2');
      console.log('2/2 Меняю код на токен: POST /login_check');

      token = await api.http.login();

      console.log(`\nТокен сохранён: ${tokenFile}`);
      console.log(`Токен: ${maskToken(token)}`);
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      console.error('Проверьте API_PHONE и API_CODE в .env.');
    }
    throw error;
  }
}
