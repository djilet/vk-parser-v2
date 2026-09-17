# vk-sales-bot

A VK sales pipeline for ImGame: scrape VK communities, send personalized outreach, sync
conversation history, classify fraud via Yandex GPT, post Slack stats — plus a small chat UI
for the two connected VK accounts, backed by VK long-poll and server-sent events.

One repo, one VK layer, one token store, one set of types — npm workspaces, full TypeScript.

## Layout

```
packages/
  core/        VK API client, token store, browser lifecycle, env config, paths
  sales-api/   imgame-backend PHP sales API client (see docs/imgame-backend-sales-api.md)
  chat/        Inbox domain: conversation summaries, pins, chat statuses, message formatting
  parser/      Scraping, outreach, message sync, LLM fraud classification, Slack stats
  contracts/   Type-only, dependency-free types shared between apps/server and apps/web
apps/
  cli/         The vk-sales-bot binary — see `vk-sales-bot --help`
  server/      HTTP API + SSE + VK long-poll manager for the chat UI
  web/         React + antd chat UI
```

## Setup

```bash
npm ci
cp .env.example .env   # fill in API_BASE_URL / API_PHONE / API_CODE at minimum
npm run build
```

VK login state (`chrome-profile/`, `chrome-profile-2/`, `tokens/`) is untouched by the merge —
if you already had a working vk-parser-v2 checkout, your two VK accounts keep working with no
re-login needed.

## Everyday commands

```bash
npx vk-sales-bot --help
npx vk-sales-bot vk list                       # show saved VK tokens
npx vk-sales-bot vk token --browser 1           # (re)acquire a VK token
npx vk-sales-bot parse --query "..." --limit 5  # scrape communities
npx vk-sales-bot send --limit 10                # send outreach to pending communities
npx vk-sales-bot sync-messages                  # sync conversation history
```

See [COMMANDS.md](COMMANDS.md) for the full command reference, and the root `package.json`
scripts for the short aliases (`npm run parse-skip`, `npm run vk-token`, etc.) kept for muscle
memory from the pre-merge projects.

## Chat UI

```bash
npm run dev:server   # HTTP API + SSE + VK long-poll, port 3001
npm run dev:web       # React app, port 5173, proxies /api to :3001
```

The server has no authentication and CORS is open to `CORS_ORIGIN` (default the Vite dev
origin) — it is meant to run on localhost only. Do not expose it on a public network as-is.

## Testing

```bash
npm run typecheck   # tsc -b across every package and app (except apps/web, checked via its own build)
npm test            # tsx --test over packages/*/test/*.test.ts
```
