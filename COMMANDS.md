# Commands

All commands are run from the project root with npm, and are defined in [package.json](package.json).

| Command | Runs | Description |
|---|---|---|
| `npm run login` | `node src/login.js` | Logs in to the PHP API and saves the bearer token to `.auth-token.json`. Pass `--force` to ignore a saved token and log in again. |
| `npm start` | `node src/index.js` | Main entry point — runs the VK parser. |
| `npm run parse-skip` | `node src/parseSkip.js` | Parses/processes skipped items. |
| `npm run parse-descriptions` | `node src/parseDescriptions.js` | One-off backfill — walks all communities already in the DB, opens each in the browser, scrapes only the description via the same modal, and updates the record. Optional `--limit N` to smoke-test on a few rows first, and `--offset N` to start from the N+1-th community — use it to resume after VK rate-limits the parser. Stops early and prints the offset to resume from once 10 pages in a row fail to render. |
| `npm run messages` | `node src/openMessages.js` | Opens messages. |
| `npm run send-messages` | `node src/sendMessages.js` | Sends messages. |
| `npm run send-messages-parity` | `node src/sendMessagesParity.js` | Sends messages (parity variant). |
| `npm run slack-stats` | `node src/sendSlackStats.js` | Sends stats to Slack. |
| `npm run import` | `node src/importJson.js` | Imports JSON data. |
| `npm run migrate-supabase` | `node src/migrateFromSupabase.js` | One-off copy of the old Supabase `communities`/`community_*` tables into the backend's `sales_*` tables via the API. Requires `SB_URL`/`SB_KEY` in addition to the `API_*` vars. Safe to re-run — matches existing records and skips/updates instead of duplicating. See [docs/imgame-backend-sales-api.md](docs/imgame-backend-sales-api.md). |
| `npm run check-fraud` | `node src/checkFraud.js` | Backfill — walks communities with `is_fraud IS NULL`, asks Yandex GPT whether each is a sports organizer (by name/description), and sets `is_fraud` accordingly (organizer → `false`, not an organizer → `true`). No browser involved. Requires `YANDEX_GPT_API_KEY`/`YANDEX_GPT_FOLDER_ID` in addition to the `API_*` vars. Optional `--limit N` to smoke-test on a few rows first. |
| `npm run vk-token` | `node src/vkToken.js` | Opens a browser on the **same profile as the rest of the scraper** (`./chrome-profile`, or `CONNECT_URL` if set), drives vkhost.github.io to get a VK user access token (via the official `vk.com` app), and saves it to `tokens/browser-<VK_BROWSER>.json` (gitignored, 24h VK lifetime). Required once before any `sync-messages*` command; re-run when the saved token expires. Use `VK_BROWSER=2` for a second account/profile. Because it reuses the scraping profile: don't run it at the same time as another script that has that profile open (Chrome will refuse the second launch), and if that profile has never logged into VK, log in by hand in the window that opens before vkhost's "Продолжить как …" button can appear — impossible under `HEADLESS=true` on a first run. |
| `npm run sync-messages-full` | `node src/syncMessages.js --full` | First-time bulk ingest: for every community with a row in `sales_community_messages_sent` (i.e. we've written to it), downloads the whole VK conversation history via `messages.getHistory` and uploads it to `sales_messages`, chunk by chunk as it's fetched (a mid-run failure keeps whatever was already uploaded). Safe to re-run — the upload is an idempotent upsert on `(community_id, vk_message_id)`. Also the way to backfill a community whose history got truncated by the 10,000-message-per-community safety cap. Optional `--limit N` to smoke-test on a few communities first, `--community <id>` to run it against a single community instead of all of them. |
| `npm run sync-messages` | `node src/syncMessages.js` | Incremental sync: for every community with a row in `sales_community_messages_sent`, fetches its watermark from `/admin/sales/messages/sync-state` (or treats it as having none, if it has zero messages stored yet) and downloads only messages newer than that. Pass `--community <id>` to sync just one community's new messages instead of all of them. Optional `--limit N`. Aborts the whole run (rather than limping through per-community errors) if the VK token has expired mid-run — re-run `npm run vk-token` and retry. |

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and fill in the required environment variables before running any command.

Run `npm test` to run the unit tests (`node --test`, no extra dependencies) — currently covers the
VK-message-to-upload-row mapping contract used by `sync-messages*`.

## Authentication

Every command that talks to the PHP API authenticates with a bearer token. `npm run login`
requests a one-time code (`POST /users/get-temp-password-v2`), exchanges it for a token
(`POST /login_check`) and writes the token to `.auth-token.json`, which is gitignored.

Running it by hand is optional — the other commands log in on their own when no valid token
is saved. Use it to check credentials before a long run, or with `--force` after changing
`API_PHONE`.
