import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from './config.js';
import { launchBrowser } from './browser.js';
import { loadCommunitiesFromJson } from './import/fromJson.js';
import { sendCommunityMessage } from './steps/sendMessage.js';
import {
  appendSentMsgUrl,
  isAlreadySent,
  loadSentLog,
} from './storage/sentLog.js';
import { waitForEnter } from './utils/prompt.js';

const MESSAGE_TEMPLATE_PATH = resolve('msg_template.txt');

function ensureConfig() {
  const example = 'npm run messages -- --file output/2026-05-27_16-02-32.json';

  if (!config.jsonFile?.trim()) {
    console.error(`Укажите путь к JSON: ${example}`);
    process.exit(1);
  }
}

async function loadMessageTemplate() {
  try {
    return (await readFile(MESSAGE_TEMPLATE_PATH, 'utf8')).trimEnd();
  } catch {
    console.error(`Не удалось прочитать шаблон сообщения: ${MESSAGE_TEMPLATE_PATH}`);
    process.exit(1);
  }
}

async function main() {
  ensureConfig();

  const messageText = await loadMessageTemplate();
  const { communities, filePath, searchQuery } = await loadCommunitiesFromJson(config.jsonFile.trim());
  const sentLog = await loadSentLog();
  const withMsgUrl = communities.filter((community) => community.msgUrl != null);
  const pending = withMsgUrl.filter((community) => !isAlreadySent(sentLog, community));
  const skipped = withMsgUrl.length - pending.length;

  console.log(`JSON: ${filePath}`);
  console.log(`Шаблон: ${MESSAGE_TEMPLATE_PATH}`);
  console.log(`Журнал отправок: sent.json (${sentLog.length})`);
  if (searchQuery) {
    console.log(`Запрос: ${searchQuery}`);
  }
  console.log(`Сообществ: ${communities.length}, с msgUrl: ${withMsgUrl.length}, к отправке: ${pending.length}`);

  if (skipped > 0) {
    console.log(`Пропущено (уже отправлено): ${skipped}`);
  }

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
    const label = community.name ?? community.url ?? community.msgUrl;

    console.log(`\n=== ${index + 1} из ${pending.length}: ${label} ===`);
    console.log(`Открываю: ${community.msgUrl}`);

    await page.goto(community.msgUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await sendCommunityMessage(page, messageText);

    const savedPath = await appendSentMsgUrl(community.msgUrl, sentLog);
    console.log(`Журнал обновлён: ${savedPath} (${sentLog.length})`);
  }

  console.log('\nГотово. Браузер остаётся открытым — закройте его или нажмите Ctrl+C.');
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
