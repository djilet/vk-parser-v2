#!/usr/bin/env node
import { Command } from 'commander';
import { runSessionCommand } from './commands/session.js';
import { runTokenCommand } from './commands/token.js';

const program = new Command();

program
  .name('vk-token')
  .description('Получение VK access token через vkhost.github.io')
  .version('1.0.0');

program
  .command('session')
  .description('Открыть браузер на vkhost.github.io для ручного входа в VK')
  .action(async () => {
    try {
      await runSessionCommand();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('token')
  .description('Автоматически получить и сохранить access token через Puppeteer')
  .action(async () => {
    try {
      await runTokenCommand();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
