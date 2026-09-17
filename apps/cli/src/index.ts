#!/usr/bin/env node
import { getEnvConfig } from '@vk-sales-bot/core';
import { Command } from 'commander';
import { runApiLoginCommand } from './commands/api-login.js';
import { parseAccountId, parsePeerId, runChatSendCommand } from './commands/chat.js';
import { runCheckFraudCommand } from './commands/check-fraud.js';
import { runImportCommand } from './commands/import.js';
import { runParseCommand } from './commands/parse.js';
import { runParseDescriptionsCommand } from './commands/parse-descriptions.js';
import { runSendCommand } from './commands/send.js';
import { runServeCommand } from './commands/serve.js';
import { runSlackStatsCommand } from './commands/slack-stats.js';
import { runSyncMessagesCommand } from './commands/sync-messages.js';
import {
  runVkClearSessionCommand,
  runVkGetCommand,
  runVkListCommand,
  runVkShowCommand,
  runVkTokenAllCommand,
  runVkTokenAutoCommand,
  runVkTokenCommand,
  runVkSessionCommand,
} from './commands/vk.js';

const program = new Command();

program.name('vk-sales-bot').description('VK sales pipeline: community scraping, outreach, message sync and a chat UI').version('1.0.0');

function fail(error: unknown): never {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

function action<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (error) {
      fail(error);
    }
  };
}

const browserOption = ['-b, --browser <number>', 'Номер браузера (1 или 2)', '1'] as const;

// --- sales pipeline ---

program
  .command('parse')
  .description('Найти сообщества по запросу и сохранить их через API')
  .requiredOption('-q, --query <text>', 'Поисковый запрос')
  .requiredOption('-l, --limit <n>', 'Сколько сообществ обработать', (v) => Number.parseInt(v, 10))
  .option('-s, --skip <n>', 'Сколько первых сообществ в списке пропустить', (v) => Number.parseInt(v, 10), 0)
  .option(...browserOption)
  .option('--keep-open', 'Не закрывать браузер по завершении')
  .action(
    action(async (options: { query: string; limit: number; skip: number; browser: string; keepOpen?: boolean }) => {
      await runParseCommand(getEnvConfig(), options);
    }),
  );

program
  .command('parse-descriptions')
  .description('Дозаполнить description для сообществ, у которых он пуст')
  .option('-o, --offset <n>', 'С какого элемента списка начинать', (v) => Number.parseInt(v, 10))
  .option('-l, --limit <n>', 'Сколько сообществ обработать', (v) => Number.parseInt(v, 10))
  .option(...browserOption)
  .option('--keep-open', 'Не закрывать браузер по завершении')
  .action(
    action(async (options: { offset?: number; limit?: number; browser: string; keepOpen?: boolean }) => {
      await runParseDescriptionsCommand(getEnvConfig(), options);
    }),
  );

program
  .command('send')
  .description('Отправить персонализированные сообщения сообществам, которым ещё не писали')
  .requiredOption('-l, --limit <n>', 'Сколько сообществ обработать', (v) => Number.parseInt(v, 10))
  .option('--parity <even|odd>', 'Обработать только чётные/нечётные id (делит работу между аккаунтами)')
  .option('--even', 'Сокращение для --parity even')
  .option('--odd', 'Сокращение для --parity odd')
  .option(...browserOption)
  .option('--dry-run', 'Показать, что будет отправлено, не отправляя')
  .option('--keep-open', 'Не закрывать браузер по завершении')
  .action(
    action(
      async (options: {
        limit: number;
        parity?: 'even' | 'odd';
        even?: boolean;
        odd?: boolean;
        browser: string;
        dryRun?: boolean;
        keepOpen?: boolean;
      }) => {
        await runSendCommand(getEnvConfig(), options);
      },
    ),
  );

program
  .command('sync-messages')
  .description('Синхронизировать историю переписок с sales_messages')
  .option('--full', 'Полная заливка истории вместо до-синхронизации новых сообщений')
  .option('--all-conversations', 'Искать переписки через messages.getConversations, а не только журнал отправок')
  .option('-c, --community <id>', 'Синхронизировать только одно сообщество', (v) => Number.parseInt(v, 10))
  .option('-l, --limit <n>', 'Максимум сообществ за прогон', (v) => Number.parseInt(v, 10))
  .option(...browserOption)
  .action(
    action(
      async (options: { full?: boolean; allConversations?: boolean; community?: number; limit?: number; browser: string }) => {
        await runSyncMessagesCommand(getEnvConfig(), options);
      },
    ),
  );

program
  .command('import')
  .description('Импортировать сообщества из локального JSON-файла в API')
  .requiredOption('-f, --file <path>', 'Путь к JSON-файлу')
  .action(
    action(async (options: { file: string }) => {
      await runImportCommand(getEnvConfig(), options);
    }),
  );

program
  .command('check-fraud')
  .description('Классифицировать непроверенные сообщества через Yandex GPT (is_fraud)')
  .option('-l, --limit <n>', 'Максимум сообществ за прогон', (v) => Number.parseInt(v, 10))
  .action(
    action(async (options: { limit?: number }) => {
      await runCheckFraudCommand(getEnvConfig(), options);
    }),
  );

program
  .command('slack-stats')
  .description('Отправить сводку по отправкам в Slack')
  .action(
    action(async () => {
      await runSlackStatsCommand(getEnvConfig());
    }),
  );

program
  .command('api-login')
  .description('Войти в imgame-backend sales API и сохранить bearer-токен')
  .option('--force', 'Игнорировать сохранённый токен и войти заново')
  .action(
    action(async (options: { force?: boolean }) => {
      await runApiLoginCommand(getEnvConfig(), options);
    }),
  );

program
  .command('serve')
  .description('Запустить HTTP-сервер чата (apps/server)')
  .option('-p, --port <n>', 'Порт', (v) => Number.parseInt(v, 10))
  .action(
    action(async (options: { port?: number }) => {
      await runServeCommand(options);
    }),
  );

// --- vk namespace: token/session management ---

const vk = program.command('vk').description('Управление VK-сессиями и токенами');

vk.command('session')
  .description('Открыть браузер для ручного входа в VK')
  .option(...browserOption)
  .action(
    action(async (options: { browser: string }) => {
      await runVkSessionCommand(getEnvConfig(), options.browser);
    }),
  );

vk.command('token')
  .description('Автоматически получить и сохранить access token через Puppeteer')
  .option(...browserOption)
  .option('--headless', 'Headless-режим')
  .action(
    action(async (options: { browser: string; headless?: boolean }) => {
      await runVkTokenCommand(getEnvConfig(), options.browser, options.headless);
    }),
  );

vk.command('token-all')
  .description('По очереди получить и сохранить токены для всех браузеров')
  .action(
    action(async () => {
      await runVkTokenAllCommand(getEnvConfig());
    }),
  );

vk.command('token-auto')
  .description('Обновить токены, которым исполнилось 23ч 59м 59с (используется в predev)')
  .action(
    action(async () => {
      await runVkTokenAutoCommand(getEnvConfig());
    }),
  );

vk.command('list')
  .description('Показать все сохранённые токены')
  .action(action(runVkListCommand));

vk.command('show')
  .description('Показать сохранённый токен для браузера')
  .option(...browserOption)
  .option('--full', 'Показать полный access_token')
  .action(
    action(async (options: { browser: string; full?: boolean }) => {
      await runVkShowCommand(options.browser, options.full);
    }),
  );

vk.command('get')
  .description('Вывести access_token для использования в скриптах')
  .option(...browserOption)
  .action(
    action(async (options: { browser: string }) => {
      await runVkGetCommand(options.browser);
    }),
  );

vk.command('clear-session')
  .description('Удалить профиль Chrome и токен для браузера')
  .requiredOption(...browserOption)
  .option('--yes', 'Подтвердить необратимое удаление')
  .action(
    action(async (options: { browser: string; yes?: boolean }) => {
      await runVkClearSessionCommand(options);
    }),
  );

// --- chat namespace ---

const chat = program.command('chat').description('Отправка сообщений через сохранённый VK-токен аккаунта');

chat
  .command('send')
  .description('Отправить сообщение в чат')
  .requiredOption('-a, --account <id>', 'accountId (userId из токена)')
  .requiredOption('-p, --peer <id>', 'peerId чата')
  .requiredOption('-m, --message <text>', 'Текст сообщения')
  .action(
    action(async (options: { account: string; peer: string; message: string }) => {
      await runChatSendCommand(getEnvConfig(), {
        accountId: parseAccountId(options.account),
        peerId: parsePeerId(options.peer),
        message: options.message,
      });
    }),
  );

program.parse();
