import type { EnvConfig } from '@vk-sales-bot/core';
import { createSalesApiClient } from '@vk-sales-bot/sales-api';
import { countMessagesSentToday, countMessagesSentTotal, countWritableCommunities, sendSlackMessage } from '@vk-sales-bot/parser';

function formatSentPercent(sentTotal: number, writableCommunities: number): string {
  if (writableCommunities === 0) {
    return '0.0%';
  }

  const percent = (sentTotal / writableCommunities) * 100;
  return `${percent.toFixed(1)}%`;
}

function buildStatsMessage(sentToday: number, sentTotal: number, sentPercent: string, writableCommunities: number): string {
  return `Сегодня отправили *${sentToday}*\nВсего отправлено *${sentTotal}* / *${sentPercent}*\nМожно написать *${writableCommunities}*`;
}

export async function runSlackStatsCommand(env: EnvConfig): Promise<void> {
  if (!env.slack.webhookUrl) {
    throw new Error('Slack не настроен: задайте SLACK_WEBHOOK_URL в .env');
  }

  const api = createSalesApiClient(env.api);

  const [sentToday, sentTotal, writableCommunities] = await Promise.all([
    countMessagesSentToday(api, env.stats.timezone),
    countMessagesSentTotal(api),
    countWritableCommunities(api),
  ]);

  const sentPercent = formatSentPercent(sentTotal, writableCommunities);
  const message = buildStatsMessage(sentToday, sentTotal, sentPercent, writableCommunities);

  await sendSlackMessage(env.slack.webhookUrl, message);

  console.log('Отправлено в Slack:');
  console.log(`  Сегодня отправили: ${sentToday}`);
  console.log(`  Всего отправлено: ${sentTotal} / ${sentPercent}`);
  console.log(`  Можно написать: ${writableCommunities}`);
}
