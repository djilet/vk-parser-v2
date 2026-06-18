#!/usr/bin/env node
import { Command } from 'commander';
import { runSessionCommand } from './commands/session.js';
import { runTokenCommand } from './commands/token.js';
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

program.parse();
