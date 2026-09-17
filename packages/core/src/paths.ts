import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedRoot: string | null = null;

/**
 * Repo root, not process.cwd() — a workspace script's cwd is the workspace directory
 * (e.g. `npm run x -w apps/cli` cds into apps/cli before running), so anything that
 * wrote to `tokens/`, `chrome-profile-N/` or `data/` relative to process.cwd() would
 * silently write into the wrong place or create a stray file outside .gitignore's
 * reach. Walk up from this module's own location to the directory holding the root
 * package.json (identified by its `workspaces` field) instead.
 */
export function repoRoot(): string {
  if (cachedRoot) {
    return cachedRoot;
  }

  const startDir = dirname(fileURLToPath(import.meta.url));
  let dir = startDir;

  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(dir, 'package.json');

    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { workspaces?: unknown };
        if (pkg.workspaces) {
          cachedRoot = dir;
          return dir;
        }
      } catch {
        // malformed package.json above us — keep walking up
      }
    }

    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  throw new Error(`Не удалось найти корень репозитория (package.json с "workspaces") выше ${startDir}`);
}

export function repoPath(...segments: string[]): string {
  return join(repoRoot(), ...segments);
}

/** Runtime state that must survive being run from any workspace: templates, pins, chat statuses. */
export function dataPath(...segments: string[]): string {
  return repoPath('data', ...segments);
}

export type BrowserPaths = {
  browserProfile: string;
  tokenFile: string;
};

/**
 * Браузер #1 намеренно оставлен на './chrome-profile' (путь ещё из vk-parser-v2) — так уже
 * залогиненные пользователи не теряют сессию при обновлении. Остальные браузеры — свой профиль
 * на каждый, чтобы несколько VK-аккаунтов не делили одну и ту же сессию/куки.
 */
export function getBrowserPaths(browserId: number): BrowserPaths {
  return {
    browserProfile: browserId === 1 ? repoPath('chrome-profile') : repoPath(`chrome-profile-${browserId}`),
    tokenFile: repoPath('tokens', `browser-${browserId}.json`),
  };
}

export function debugAuthDumpPath(...segments: string[]): string {
  return repoPath('debug-vk-auth', ...segments);
}
