import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type BrowserId } from '../config.js';
import { formatTokenStatus, isTokenExpired, loadAllTokens, loadToken, type SavedToken } from '../token/index.js';
import { getConversations, getFullHistory, sleep } from '../vk/api.js';
import { formatMessages } from '../vk/message-format.js';
import type { VkConversationItem, VkGroup, VkProfile } from '../vk/types.js';

const DEFAULT_CHAT_LIMIT = 60;
const DEFAULT_MAX_MESSAGES = 200;
const CONTEXT_MESSAGES = 10;
const HISTORY_DELAY_MS = 1000;

export type UnreadCommandOptions = {
  browserId?: BrowserId;
  chatLimit: number;
  outputDir: string;
  maxMessages: number;
};

export type UnreadChatSummary = {
  peerId: number;
  peerType: string;
  title: string;
  unreadCount: number;
  lastMessageAt: string | null;
  conversationFile: string;
};

export type AccountUnreadSummary = {
  browserId: BrowserId;
  userId: number;
  email?: string;
  scannedChats: number;
  unreadChats: UnreadChatSummary[];
};

export type UnreadReport = {
  generatedAt: string;
  chatLimit: number;
  maxMessages: number;
  accounts: AccountUnreadSummary[];
};

function resolvePeerTitle(
  item: VkConversationItem,
  profiles: VkProfile[] = [],
  groups: VkGroup[] = [],
): string {
  const peer = item.conversation.peer;

  if (peer.type === 'user') {
    const profile = profiles.find((entry) => entry.id === peer.id);
    if (profile) {
      return `${profile.first_name} ${profile.last_name}`.trim();
    }
  }

  if (peer.type === 'group') {
    const group = groups.find((entry) => entry.id === Math.abs(peer.id));
    if (group) {
      return group.name;
    }
  }

  if (peer.type === 'chat') {
    const chatId = peer.id - 2_000_000_000;
    return `Беседа #${chatId}`;
  }

  return `peer_${peer.id}`;
}

function conversationFileName(peerId: number): string {
  return `${peerId}.json`;
}

function accountRelativeDir(userId: number): string {
  return join('accounts', String(userId));
}

async function collectTokens(browserId?: BrowserId): Promise<SavedToken[]> {
  if (browserId) {
    const token = await loadToken(browserId);
    return token ? [token] : [];
  }

  return loadAllTokens();
}

export async function runUnreadChatsCommand(options: UnreadCommandOptions): Promise<UnreadReport> {
  const tokens = await collectTokens(options.browserId);

  if (tokens.length === 0) {
    throw new Error('Нет сохранённых токенов. Запустите: npm run vk:token');
  }

  const runDir = join(options.outputDir, new Date().toISOString().replace(/[:.]/g, '-'));
  const accountsDir = join(runDir, 'accounts');
  await mkdir(accountsDir, { recursive: true });

  const report: UnreadReport = {
    generatedAt: new Date().toISOString(),
    chatLimit: options.chatLimit,
    maxMessages: options.maxMessages,
    accounts: [],
  };

  for (const token of tokens) {
    if (isTokenExpired(token)) {
      console.warn(`Пропуск браузера #${token.browserId}: токен истёк (${formatTokenStatus(token)})`);
      continue;
    }

    if (!token.userId) {
      console.warn(`Пропуск браузера #${token.browserId}: в токене нет userId`);
      continue;
    }

    console.log(`\nБраузер #${token.browserId}, user_id=${token.userId}`);

    const accountDir = join(accountsDir, String(token.userId));
    await mkdir(accountDir, { recursive: true });

    const conversations = await getConversations(token.accessToken, options.chatLimit);
    const unreadItems = conversations.items.filter((item) => item.conversation.unread_count > 0);

    console.log(`  Просмотрено чатов: ${conversations.items.length}`);
    console.log(`  Непрочитанных: ${unreadItems.length}`);

    const accountSummary: AccountUnreadSummary = {
      browserId: token.browserId,
      userId: token.userId,
      email: token.email,
      scannedChats: conversations.items.length,
      unreadChats: [],
    };

    for (const item of unreadItems) {
      const peerId = item.conversation.peer.id;
      const title = resolvePeerTitle(item, conversations.profiles, conversations.groups);
      const unreadCount = item.conversation.unread_count;
      const fetchLimit = Math.min(options.maxMessages, Math.max(unreadCount + CONTEXT_MESSAGES, 1));
      const fileName = conversationFileName(peerId);
      const filePath = join(accountDir, fileName);
      const relativeFile = join(accountRelativeDir(token.userId), fileName);

      console.log(`  → ${title} (peer_id=${peerId}, unread=${unreadCount})`);

      try {
        const history = await getFullHistory(token.accessToken, peerId, {
          maxMessages: fetchLimit,
          onProgress: (loaded, total) => {
            const target = Math.min(total, fetchLimit);
            process.stdout.write(`\r    загружено сообщений: ${loaded}/${target}`);
          },
        });
        process.stdout.write('\n');

        const messages = formatMessages(history.items);

        if (messages.length === 0) {
          console.warn(`    сообщений в выборке не найдено, пропуск`);
          continue;
        }

        const payload = {
          userId: token.userId,
          browserId: token.browserId,
          peerId,
          title,
          unreadCount,
          messages,
        };

        await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

        accountSummary.unreadChats.push({
          peerId,
          peerType: item.conversation.peer.type,
          title,
          unreadCount,
          lastMessageAt: messages.at(-1)?.date ?? null,
          conversationFile: relativeFile,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`    ошибка выгрузки: ${message}`);
      }

      await sleep(HISTORY_DELAY_MS);
    }

    report.accounts.push(accountSummary);

    const accountSummaryPath = join(accountDir, 'summary.json');
    await writeFile(accountSummaryPath, JSON.stringify(accountSummary, null, 2) + '\n', 'utf8');
  }

  const summaryPath = join(runDir, 'summary.json');
  await writeFile(summaryPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  printReport(report, runDir, summaryPath);

  return report;
}

function printReport(report: UnreadReport, runDir: string, summaryPath: string): void {
  console.log('\n=== Непрочитанные чаты ===\n');

  if (report.accounts.length === 0) {
    console.log('Нет аккаунтов с активными токенами.');
    return;
  }

  for (const account of report.accounts) {
    console.log(`user_id=${account.userId} (браузер #${account.browserId})`);
    console.log(`  папка: accounts/${account.userId}/`);

    if (account.unreadChats.length === 0) {
      console.log('  непрочитанных чатов нет\n');
      continue;
    }

    for (const chat of account.unreadChats) {
      console.log(
        `  • ${chat.title} | peer_id=${chat.peerId} | unread=${chat.unreadCount} | ${chat.conversationFile}`,
      );
    }

    console.log('');
  }

  console.log(`Отчёт: ${summaryPath}`);
  console.log(`Папка: ${runDir}`);
}

export function parseChatLimit(value: string): number {
  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('Параметр --limit должен быть целым числом от 1 до 200');
  }

  return limit;
}

export function getDefaultOutputDir(): string {
  return join(process.cwd(), 'output', 'unread-chats');
}

export function parseMaxMessages(value?: string): number {
  if (!value) {
    return DEFAULT_MAX_MESSAGES;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Параметр --max-messages должен быть целым числом больше 0');
  }

  return limit;
}
