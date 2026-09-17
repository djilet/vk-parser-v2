import { spawn } from 'node:child_process';
import { repoPath } from '@vk-sales-bot/core';

export type ServeOptions = { port?: number };

/**
 * Runs the compiled server (apps/server/dist/index.js) as a child process — production should
 * consume the built output, not tsx, so a type error in the server actually fails the build
 * instead of shipping silently (see the `dev:server` npm script for the tsx-based dev loop).
 */
export async function runServeCommand(options: ServeOptions): Promise<void> {
  const entry = repoPath('apps', 'server', 'dist', 'index.js');

  const child = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    env: { ...process.env, ...(options.port ? { PORT: String(options.port) } : {}) },
  });

  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`Server process exited with code ${code}`));
        return;
      }
      resolve();
    });
    child.on('error', reject);
  });
}
