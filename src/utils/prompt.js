import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export async function waitForEnter(message = 'Нажмите Enter для продолжения...') {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  await rl.question(message);
  rl.close();
}
