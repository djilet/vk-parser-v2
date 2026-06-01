import { config } from './config.js';
import { launchBrowser } from './browser.js';
import { loadMessageTemplate, MESSAGE_TEMPLATE_PATH } from './messaging/messageTemplate.js';
import { loadPendingCommunities } from './storage/pendingCommunities.js';
import { markCommunityMessageSent } from './storage/sentMessages.js';
import { sendCommunityMessage } from './steps/sendMessage.js';
import { isSupabaseConfigured } from './supabase/client.js';
import { waitForEnter } from './utils/prompt.js';

function ensureConfig() {
  const example = 'npm run send-messages -- --limit 10';

  if (!config.limit) {
    console.error(`Укажите количество сообществ: ${example}`);
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error('Supabase не настроен: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env');
    process.exit(1);
  }
}

async function main() {
  ensureConfig();

  const messageText = await loadMessageTemplate();
  const pending = await loadPendingCommunities(config.limit);

  console.log(`Шаблон: ${MESSAGE_TEMPLATE_PATH}`);
  console.log(`Запрошено сообществ: ${config.limit}`);
  console.log(`Найдено к отправке: ${pending.length}`);

  if (pending.length === 0) {
    console.log('Нет новых сообществ для отправки. Завершаю работу.');
    return;
  }

  const browser = await launchBrowser();
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());

  console.log(`Открываю страницу входа: ${config.loginUrl}`);
  await page.goto(config.loginUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  console.log('\nВойдите в аккаунт VK в браузере.');
  await waitForEnter('Когда войдёте — нажмите Enter в этой консоли...\n');

  for (let index = 0; index < pending.length; index += 1) {
    const community = pending[index];
    const label = community.name ?? community.url ?? community.msg_url;

    console.log(`\n=== ${index + 1} из ${pending.length}: ${label} ===`);
    console.log(`Открываю: ${community.msg_url}`);

    await page.goto(community.msg_url, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await sendCommunityMessage(page, messageText);

    const sentId = await markCommunityMessageSent(community);
    console.log(`Отправка записана в БД: community_messages_sent.id=${sentId}`);
  }

  console.log('\nГотово. Браузер остаётся открытым — закройте его или нажмите Ctrl+C.');
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
