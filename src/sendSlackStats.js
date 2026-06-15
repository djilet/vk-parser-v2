import { config } from './config.js';
import { sendSlackMessage } from './slack/sendMessage.js';
import { countCommunities, countMessagesSentToday } from './storage/stats.js';
import { isSupabaseConfigured } from './supabase/client.js';

function ensureConfig() {
  if (!isSupabaseConfigured()) {
    console.error('Supabase не настроен: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env');
    process.exit(1);
  }

  if (!config.slack.webhookUrl) {
    console.error('Slack не настроен: задайте SLACK_WEBHOOK_URL в .env');
    process.exit(1);
  }
}

function buildStatsMessage(sentToday, totalCommunities) {
  return `Сегодня отправили *${sentToday}*\nВсего сообществ в базе *${totalCommunities}*`;
}

async function main() {
  ensureConfig();

  const [sentToday, totalCommunities] = await Promise.all([
    countMessagesSentToday(config.stats.timezone),
    countCommunities(),
  ]);

  const message = buildStatsMessage(sentToday, totalCommunities);

  await sendSlackMessage(config.slack.webhookUrl, message);

  console.log('Отправлено в Slack:');
  console.log(`  Сегодня отправили: ${sentToday}`);
  console.log(`  Всего сообществ в базе: ${totalCommunities}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
