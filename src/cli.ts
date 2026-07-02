#!/usr/bin/env node
import { Command } from 'commander';
import { runSessionCommand } from './commands/session.js';
import { runTokenCommand, runAllTokensCommand } from './commands/token.js';
import { runGetTokenCommand, runListTokensCommand, runShowTokenCommand } from './commands/tokens.js';
import { getDefaultOutputDir, parseChatLimit, parseMaxMessages, runUnreadChatsCommand } from './commands/unread.js';
import { parseAccountId, parsePeerId, runSendMessageCommand } from './commands/send.js';
import { parseBrowserId } from './config.js';

const program = new Command();

program
  .name('vk-token')
  .description('Получение VK access token через vkhost.github.io')
  .version('1.0.0');

const browserOption = ['-b, --browser <number>', 'Номер браузера (1 или 2)', '1'] as const;

program
  .command('session')
  .description('Открыть браузер на vkhost.github.io для ручного входа в VK')
  .option(...browserOption)
  .action(async (options: { browser: string }) => {
    try {
      await runSessionCommand(parseBrowserId(options.browser));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('token')
  .description('Автоматически получить и сохранить access token через Puppeteer')
  .option(...browserOption)
  .action(async (options: { browser: string }) => {
    try {
      await runTokenCommand(parseBrowserId(options.browser));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('token-all')
  .description('По очереди получить и сохранить токены для браузеров 1 и 2')
  .action(async () => {
    try {
      await runAllTokensCommand();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('Показать все сохранённые токены')
  .action(async () => {
    try {
      await runListTokensCommand();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('show')
  .description('Показать сохранённый токен для браузера')
  .option(...browserOption)
  .option('--full', 'Показать полный access_token')
  .action(async (options: { browser: string; full?: boolean }) => {
    try {
      await runShowTokenCommand(parseBrowserId(options.browser), options.full);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('get')
  .description('Вывести access_token для использования в скриптах')
  .option(...browserOption)
  .action(async (options: { browser: string }) => {
    try {
      await runGetTokenCommand(parseBrowserId(options.browser));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('unread')
  .description('Найти непрочитанные чаты среди последних N диалогов и выгрузить беседы в JSON')
  .option('-b, --browser <number>', 'Номер браузера (1 или 2); без флага — все сохранённые аккаунты')
  .option('-l, --limit <number>', 'Сколько последних чатов проверить', '60')
  .option('-m, --max-messages <number>', 'Сколько последних сообщений проверять в каждом чате', '200')
  .option('-o, --output <dir>', 'Папка для отчёта', getDefaultOutputDir())
  .action(async (options: { browser?: string; limit: string; maxMessages?: string; output: string }) => {
    try {
      await runUnreadChatsCommand({
        browserId: options.browser ? parseBrowserId(options.browser) : undefined,
        chatLimit: parseChatLimit(options.limit),
        maxMessages: parseMaxMessages(options.maxMessages),
        outputDir: options.output,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('send')
  .description('Отправить сообщение в чат')
  .requiredOption('-a, --account <id>', 'accountId (userId из токена)')
  .requiredOption('-p, --peer <id>', 'peerId чата')
  .requiredOption('-m, --message <text>', 'Текст сообщения')
  .action(async (options: { account: string; peer: string; message: string }) => {
    try {
      await runSendMessageCommand({
        accountId: parseAccountId(options.account),
        peerId: parsePeerId(options.peer),
        message: options.message,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
