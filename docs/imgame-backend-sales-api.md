# imgame-backend — `sales_*` API

Local reference for the admin API imgame-backend exposes over the `sales_communities`,
`sales_community_contacts`, `sales_community_search_queries` and `sales_community_messages_sent`
tables. Source: `imgame-backend/src/Controller/Sales*Controller.php`,
`imgame-backend/src/Domain/Sales*/Command/*Input.php`, `imgame-backend/src/Entity/Sales*.php`,
`imgame-backend/src/Migrations/Version20260908{120000,130000,140000,150000}.php`.

All paths below are relative to `API_BASE_URL` (e.g. `https://football.dev.roowix.com/api`), which
already includes the `/api` prefix.

## Auth

JWT bearer token, `ROLE_ADMIN` required on every endpoint in this document.

1. `POST /users/get-temp-password-v2` — body `{"phone": "<phone>"}`. Sends a one-time code (on
   dev/sandbox/test it's always `1234`).
2. `POST /login_check` — body `{"username": "<phone>", "password": "<code>"}` → `{"token": "<jwt>"}`.
3. Send `Authorization: Bearer <token>` on every subsequent request. Token TTL is 1 year.

Already implemented in `src/api/auth.js` / `src/api/client.js` / `src/api/tokenStore.js` — reuse
those rather than re-implementing this flow.

## Conventions shared by all four endpoints

- **List** (`GET`, no id): response is `{"items": [...], "total": N, "limit": L, "offset": O}`.
  `limit` is capped server-side at **20** (`AbstractSalesController::MAX_LIMIT`); the JS client's
  `apiIterate`/`apiListAll` (`src/api/client.js`) page through this automatically.
- **Get one** (`GET /{id}`): full record, including fields omitted from the list view.
- **Create** (`POST`): body is either a single JSON object, **or** `{"items": [ {...}, {...} ]}`
  for batch create. Batch create runs in one DB transaction — all rows succeed or the whole
  request fails (e.g. any unique-constraint violation → `409` for the entire batch, nothing
  committed). Response mirrors the input shape: single object (`201`) or
  `{"items": [...], "total": N}` (`201`).
- **Update** (`PUT /{id}`): partial update, same field set as create minus required-on-create
  fields.
- **Delete one** (`DELETE /{id}`).
- **Delete bulk** (`DELETE`, body `{"ids": [1,2,3]}`): all-or-nothing, like batch create.
- **No upsert endpoint.** Uniqueness is enforced by DB constraints (see below); a client that
  wants upsert semantics must `GET`-by-unique-field first, then `POST` or `PUT`.
- Every table has `created_at` (and `updated_at` where applicable) set server-side; don't send
  these.

## `sales_communities` — `/admin/sales/communities`

Uniques: `url`, `peer_id`.

List filters: `limit` (≤20), `offset`, `q`, `url`, `peer_id`, `is_fraud`, `source`,
`has_peer_id`, `has_msg_url`, `not_messaged`, `last_post_date_from`, `last_post_date_to`.

| field | type | notes |
|---|---|---|
| `url` | string | required on create, max 2048, **unique** |
| `name` | string | max 2048 |
| `phone` | string | max 255 |
| `site` | string | max 2048 |
| `msg_url` | string | max 2048, **unique** |
| `peer_id` | integer | **unique**, nullable |
| `last_post_date` | ISO datetime string | nullable |
| `is_fraud` | boolean | nullable |
| `source` | string enum | only `"vk"` currently valid (`App\Entity\Enum\SalesSource`) |
| `description` | string | |

Response adds `id`, `created_at`, `updated_at`.

**Renamed from the old Supabase `communities` table**: Supabase's boolean column was spelled
`is_frod` (typo) — map it to `is_fraud` here.

## `sales_community_contacts` — `/admin/sales/community-contacts`

Unique: `(community_id, profile_url)`.

List filters: `community_id`, `is_active`, `email`, `phone`, `q`.

| field | type | notes |
|---|---|---|
| `community_id` | integer | required on create, FK → `sales_communities.id` |
| `full_name` | string | max 2048 |
| `profile_url` | string | required on create, max 2048, unique per community |
| `description` | string | |
| `phone` | string | max 255 |
| `email` | string | valid email, max 255 |
| `is_active` | boolean | defaults `true` |
| `deactivated_at` | ISO datetime string | nullable |

List view only returns `id, community_id, full_name, profile_url, is_active`; `GET /{id}` returns
the full record including `description`/`phone`/`email`.

## `sales_community_search_queries` — `/admin/sales/community-search-queries`

Unique: `(community_id, search_query)`.

List filters: `community_id`, `search_query`, `q`, `last_seen_from`, `last_seen_to`.

| field | type | notes |
|---|---|---|
| `community_id` | integer | required on create, FK → `sales_communities.id` |
| `search_query` | string | required on create, max 1024 |
| `first_seen_at` | ISO datetime string | |
| `last_seen_at` | ISO datetime string | |

**Schema change vs. Supabase**: the old `community_search_queries` table had no surrogate key —
its primary key was the pair `(community_id, search_query)`. The backend table adds an `id`
column; treat `(community_id, search_query)` as the logical unique key when matching rows.

## `sales_community_messages_sent` — `/admin/sales/community-messages-sent`

Uniques: `chat_id`, `msg_url`.

List filters: `community_id`, `chat_id`, `sent_at_from`, `sent_at_to`.

| field | type | notes |
|---|---|---|
| `community_id` | integer | nullable, FK `ON DELETE SET NULL` |
| `chat_id` | integer | required on create, **unique** |
| `msg_url` | string | max 2048, **unique**, nullable |
| `sent_at` | ISO datetime string | |

## Field-name diffs from the deleted Supabase schema

| Supabase (`public.*`, deleted in commit `a2f1536`) | Backend (`sales_*`) |
|---|---|
| `communities.is_frod` | `sales_communities.is_fraud` |
| `communities` had no `source`/`description` before the last two Supabase migrations | present from the start on `sales_communities` |
| `community_search_queries` PK `(community_id, search_query)`, no `id` | `sales_community_search_queries.id` added, same pair kept unique |
| everything else | same column names |
