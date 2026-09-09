import { config } from './config.js';
import { getToken, isApiConfigured, login } from './api/auth.js';
import { readStoredToken, tokenFilePath } from './api/tokenStore.js';
import { parseArgs } from './utils/args.js';

function ensureConfig() {
  if (!isApiConfigured()) {
    console.error('API не настроен: задайте API_BASE_URL, API_PHONE и API_CODE в .env');
    process.exit(1);
  }
}

/** Токен в лог не пишем целиком — только чтобы отличить один от другого. */
function maskToken(token) {
  return `${token.slice(0, 12)}…${token.slice(-6)} (${token.length} символов)`;
}

async function main() {
  ensureConfig();

  const args = parseArgs();
  const force = Boolean(args.force);
  const stored = await readStoredToken();

  console.log(`API: ${config.api.baseUrl}`);
  console.log(`Телефон: ${config.api.phone}`);

  let token;

  if (stored && !force) {
    // Сохранённый токен живёт год, поэтому по умолчанию не дёргаем выдачу кода лишний раз.
    token = await getToken();
    console.log(`\nИспользую сохранённый токен: ${tokenFilePath()}`);
    console.log(`Токен: ${maskToken(token)}`);
    console.log('Чтобы войти заново, запустите с --force');
  } else {
    if (force && stored) {
      console.log('\n--force: игнорирую сохранённый токен');
    }

    console.log('\n1/2 Запрашиваю код: POST /users/get-temp-password-v2');
    console.log('2/2 Меняю код на токен: POST /login_check');

    token = await login();

    console.log(`\nТокен сохранён: ${tokenFilePath()}`);
    console.log(`Токен: ${maskToken(token)}`);
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);

  if (err.status === 401) {
    console.error('Проверьте API_PHONE и API_CODE в .env.');
  }

  process.exit(1);
});
