import { config } from './config.js';
import { launchBrowser } from './browser.js';
import { buildPersonalizedMessage, findGreetingContact, findLeaderContact } from './messaging/personalizeMessage.js';
import { loadMessageTemplate, MESSAGE_TEMPLATE_PATH } from './messaging/messageTemplate.js';
import { loadPendingCommunitiesByParity } from './storage/pendingCommunities.js';
import { markCommunityMessageSent } from './storage/sentMessages.js';
import { sendCommunityMessage } from './steps/sendMessage.js';
import { parseArgs } from './utils/args.js';
import { isSupabaseConfigured } from './supabase/client.js';
import { waitForEnter } from './utils/prompt.js';

function resolveParity() {
  const args = parseArgs();

  if (args.even && args.odd) {
    return null;
  }

  if (args.even) {
    return 'even';
  }

  if (args.odd) {
    return 'odd';
  }

  return null;
}

function ensureConfig(parity) {
  const example = 'npm run send-messages-parity -- --limit 10 --even';

  if (!config.limit) {
    console.error(`Укажите количество сообществ: ${example}`);
    process.exit(1);
  }

  if (!parity) {
    console.error(`Укажите чётность: --even или --odd. Пример: ${example}`);
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error('Supabase не настроен: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env');
    process.exit(1);
  }
}

async function main() {
  const parity = resolveParity();
  ensureConfig(parity);

  const messageTemplate = await loadMessageTemplate();
  const pending = await loadPendingCommunitiesByParity(config.limit, parity);

  const parityLabel = parity === 'even' ? 'чётные' : 'нечётные';

  console.log(`Шаблон: ${MESSAGE_TEMPLATE_PATH}`);
  console.log(`Запрошено сообществ: ${config.limit} (${parityLabel})`);
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

    const messageText = buildPersonalizedMessage(messageTemplate, community.contacts);
    const leaderContact = findLeaderContact(community.contacts);
    const greetingContact = findGreetingContact(community.contacts);

    console.log(`\n=== ${index + 1} из ${pending.length}: ${label} (id=${community.id}) ===`);
    console.log(`Открываю: ${community.msg_url}`);
    if (leaderContact) {
      console.log(`Обращение: ${leaderContact.full_name} (${leaderContact.description})`);
    } else if (greetingContact) {
      console.log(`Обращение: ${greetingContact.full_name} (первый контакт в списке)`);
    } else {
      console.log('Обращение: без персонализации (контактов нет)');
    }

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
