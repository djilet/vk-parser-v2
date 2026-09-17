import { parseBrowserId, type BrowserId, type EnvConfig } from '@vk-sales-bot/core';
import { createSalesApiClient } from '@vk-sales-bot/sales-api';
import {
  buildPersonalizedMessage,
  findGreetingContact,
  findLeaderContact,
  keepOpenOrClose,
  loadMessageTemplate,
  loadPendingCommunities,
  loadPendingCommunitiesByParity,
  markCommunityMessageSent,
  MESSAGE_TEMPLATE_PATH,
  openLoggedInPage,
  sendCommunityMessage,
  type Parity,
} from '@vk-sales-bot/parser';

export type SendOptions = {
  limit: number;
  parity?: 'even' | 'odd';
  even?: boolean;
  odd?: boolean;
  browser?: string;
  dryRun?: boolean;
  keepOpen?: boolean;
};

function resolveParity(options: SendOptions): Parity {
  if (options.parity) {
    return options.parity;
  }

  if (options.even && options.odd) {
    throw new Error('Укажите только один из флагов: --even или --odd (не оба сразу)');
  }

  if (options.even) return 'even';
  if (options.odd) return 'odd';

  return null;
}

/** Replaces vk-parser-v2's sendMessages.js + sendMessagesParity.js — parity is now an optional filter, not a second script. */
export async function runSendCommand(env: EnvConfig, options: SendOptions): Promise<void> {
  const browserId: BrowserId = parseBrowserId(options.browser);
  const api = createSalesApiClient(env.api);
  const parity = resolveParity(options);

  const messageTemplate = await loadMessageTemplate();
  const pending = parity
    ? await loadPendingCommunitiesByParity(api, options.limit, parity)
    : await loadPendingCommunities(api, options.limit);

  console.log(`Шаблон: ${MESSAGE_TEMPLATE_PATH}`);
  console.log(`Запрошено сообществ: ${options.limit}${parity ? ` (${parity === 'even' ? 'чётные' : 'нечётные'})` : ''}`);
  console.log(`Найдено к отправке: ${pending.length}`);

  if (pending.length === 0) {
    console.log('Нет новых сообществ для отправки. Завершаю работу.');
    return;
  }

  const { launched, page } = await openLoggedInPage(browserId, env);

  for (let index = 0; index < pending.length; index += 1) {
    const community = pending[index]!;
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

    if (options.dryRun) {
      console.log(`[dry-run] Текст сообщения:\n${messageText}`);
      continue;
    }

    await page.goto(community.msg_url!, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sendCommunityMessage(page, messageText, env.send);

    const sentId = await markCommunityMessageSent(api, community);
    console.log(`Отправка записана в БД: sales_community_messages_sent.id=${sentId}`);
  }

  console.log('\nГотово.');
  await keepOpenOrClose(launched, options.keepOpen ?? false);
}
