# Command reference

All commands run through the `vk-sales-bot` binary (`npx vk-sales-bot <command>`, or `node
apps/cli/dist/index.js <command>` before it's linked). Root `package.json` also keeps short
npm-script aliases for the pre-merge names.

## Sales pipeline

| command | flags | replaces (pre-merge) |
|---|---|---|
| `parse` | `--query <q>` (req) `--limit <n>` (req) `--skip <n>` `--browser <n>` `--keep-open` | `index.js` + `parseSkip.js` |
| `parse-descriptions` | `--offset <n>` `--limit <n>` `--browser <n>` `--keep-open` | `parseDescriptions.js` |
| `send` | `--limit <n>` (req) `--parity even\|odd` (or `--even`/`--odd`) `--browser <n>` `--dry-run` `--keep-open` | `sendMessages.js` + `sendMessagesParity.js` |
| `sync-messages` | `--full` `--all-conversations` `--community <id>` `--limit <n>` `--browser <n>` | `syncMessages.js` |
| `import` | `--file <path>` (req) | `importJson.js` |
| `check-fraud` | `--limit <n>` | `checkFraud.js` |
| `slack-stats` | — | `sendSlackStats.js` |
| `api-login` | `--force` | `login.js` |
| `serve` | `--port <n>` | `dev:server` |

`send`'s 180-second pre-typing pause (`SEND_BEFORE_WRITE_MS` in `.env`) is deliberate
anti-detection pacing — do not lower it, and never call `send` from an HTTP handler; it is
CLI-only and a `--limit 20` run is realistically an hour of wall-clock time.

By default, browser-driven commands (`parse`, `parse-descriptions`, `send`) close the browser
and exit when done. Pass `--keep-open` to leave the window open for manual inspection.

## `vk` namespace — token & session management

| command | flags |
|---|---|
| `vk session` | `--browser <n>` |
| `vk token` | `--browser <n>` `--headless` |
| `vk token-all` | — |
| `vk token-auto` | — (used by the `predev` npm hook) |
| `vk list` | — |
| `vk show` | `--browser <n>` `--full` |
| `vk get` | `--browser <n>` |
| `vk clear-session` | `--browser <n>` (req) `--yes` (req to confirm — this deletes a logged-in Chrome profile) |

## `chat` namespace

| command | flags |
|---|---|
| `chat send` | `--account <id>` `--peer <id>` `--message <text>` |

## Setup

```bash
npm ci
cp .env.example .env
```

Required for the sales API: `API_BASE_URL`, `API_PHONE`, `API_CODE`. Required for Slack stats:
`SLACK_WEBHOOK_URL`. Required for fraud classification: `YANDEX_GPT_API_KEY`,
`YANDEX_GPT_FOLDER_ID`.

## Authentication

Two independent systems:

- **imgame-backend bearer token** (`.auth-token.json`, gitignored) — `vk-sales-bot api-login`.
  Lives a year; only re-run with `--force` if it's been revoked.
- **VK user access tokens** (`tokens/browser-{1,2}.json`, gitignored) — `vk-sales-bot vk token
  --browser N`. Lives 24h; `vk token-auto` refreshes tokens within 1 second of expiring and is
  wired into `npm run predev`.

## Testing

```bash
npm run typecheck
npm test
```

`packages/parser/test/map-message.test.ts` guards the VK-message → upload-row mapping — it
exists because a camelCase/snake_case slip there once made every message upload silently fail.
