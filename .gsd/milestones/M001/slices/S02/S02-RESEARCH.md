# S02: Supabase Schema — Research

**Date:** 2026-03-13
**Requirements covered:** R002 (extensible site type architecture — primary owner), R006 (deployment state machine), R008 (product alerts), R009 (analytics events — schema), R010 (chat conversations), R012 (finances P&L — schema)

## Summary

S02 writes 7 SQL migration files and generates committed TypeScript types. The primary risk — painting the schema into a corner — is addressed by D001: a shared `sites` table with no TSA-specific columns, and TSA data in separate tables joined by `site_id`. A second site type (blog) would only need new tables (`blog_posts`, etc.) — zero structural changes to `sites` or any core table.

The Supabase CLI (v2.78.1, available via `npx supabase`) supports a `--db-url` flag on both `db push` and `gen types`, which bypasses the need for `supabase init` or `supabase link`. The workflow is: write `.sql` files → `cd packages/db && npx supabase db push --db-url $SUPABASE_DB_URL` → `npx supabase gen types --db-url $SUPABASE_DB_URL > src/types/supabase.ts`. **Prerequisite:** user must create a Supabase Cloud project and provide credentials before this slice can complete. The task plan must pause and prompt for this.

The `analytics_events` table needs RLS enabled with an INSERT-only policy for the `anon` role — this is the only table exposed via anon key (generated sites POST analytics directly to Supabase without hitting the admin server). All other tables use service role key from the admin panel and need RLS enabled but no anon grants.

D004 (Cloudflare DNS) means the `domains` table needs `cf_zone_id`. D005 (deployment state machine) means `sites.status` enum must cover: `draft → generating → deploying → dns_pending → ssl_pending → live → paused → error`. D006 means `focus_keyword` columns in `sites`, `tsa_categories`, `tsa_products`.

Migration naming: use timestamp prefix (`20260313000001_core.sql`) to match `supabase migration new` convention. Files applied in lexicographic order. 7 migrations map cleanly to the 7 concern areas.

## Recommendation

Write migrations as plain SQL with explicit `IF NOT EXISTS` guards. Keep RLS policies in the same migration as the table they guard — don't defer to a later migration. Use `text` over `varchar(n)` for Supabase/Postgres (no performance difference, simpler). Use `uuid` PKs with `gen_random_uuid()` default. Use `timestamptz` for all timestamps. Store `images` and `keywords` as `text[]` (native Postgres arrays, typed correctly in generated TS). Use `jsonb` for `customization`, `factors`, `suggestions`, `price_history`, `breakdown`.

For extensibility proof: after all 7 migrations are applied, we can demonstrate that adding a `blog_posts` table with a `site_id` FK is the only change needed for a second site type. No `sites` columns change. The boundary map says to document this proof in the slice summary.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Supabase type generation | `npx supabase gen types --db-url` | Zero config, no init/link needed — one command produces `supabase.ts` |
| Migration application | `npx supabase db push --db-url` | Handles migration tracking via `supabase_migrations` table in DB |
| UUID generation in SQL | `gen_random_uuid()` (built into Postgres 13+) | No extension needed; Supabase Cloud runs Postgres 15+ |
| Timestamp with timezone | `timestamptz` | Supabase Cloud is UTC; always store with timezone |
| JSONB querying | Postgres native `jsonb` operators | GIN indexable, no separate document store needed |
| RLS INSERT-only for anon | Supabase Row Level Security + `auth.role()` | Standard pattern, enforced at DB layer |

## Existing Code and Patterns

- `packages/db/supabase/migrations/` — already exists (empty, `.gitkeep` from S01). Migration files go here.
- `packages/db/tsconfig.json` — `"module": "NodeNext"`, `"rootDir": "src"`, `"outDir": "dist"`. The generated `src/types/supabase.ts` fits this structure; S03 will add `src/index.ts` and `src/client.ts`.
- `.env.example` — has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. S02 adds `SUPABASE_DB_URL` (direct postgres URL for CLI) — also needed by S03's server client.
- `docs/PRD.md` — the authoritative data model specification. Tables, fields, and relationships are all specified there. Don't invent — transcribe from PRD.
- `.gsd/DECISIONS.md` — D001 (shared sites + type-specific tables), D004 (Cloudflare), D005 (state machine), D006 (focus_keyword), D009 (subtag per site), D011 (CF-IPCountry for analytics).

## Schema Design

### Migration file plan (7 files)

| File | Tables |
|------|--------|
| `20260313000001_core.sql` | `site_types`, `site_templates`, `sites`, `settings`, `domains`, `deployments` |
| `20260313000002_tsa.sql` | `tsa_categories`, `tsa_products`, `category_products` |
| `20260313000003_analytics.sql` | `analytics_events`, `analytics_daily` |
| `20260313000004_seo.sql` | `seo_scores` |
| `20260313000005_ai.sql` | `research_sessions`, `research_results`, `chat_conversations`, `chat_messages`, `ai_jobs` |
| `20260313000006_finances.sql` | `cost_categories`, `costs`, `revenue_amazon`, `revenue_adsense`, `revenue_manual`, `revenue_daily` |
| `20260313000007_alerts.sql` | `product_alerts` |

### Key field decisions

**`sites` table (core of extensibility):**
```sql
id uuid PK,
site_type_slug text FK → site_types(slug),
template_slug text FK → site_templates(slug),
name text,
domain text UNIQUE,
niche text,
market text,           -- 'ES','US','UK','DE','FR','IT','MX','CA','JP','AU'
language text,         -- 'es','en','de','fr','it','ja'
currency text,         -- 'EUR','USD','GBP','MXN','CAD','JPY','AUD'
affiliate_tag text,    -- D009: subtag format '<tag>-<siteslug>-20'
customization jsonb,   -- colors, typography, logo, favicon
status text,           -- D005: draft|generating|deploying|dns_pending|ssl_pending|live|paused|error
focus_keyword text,    -- D006: main keyword for homepage SEO
company_name text,
contact_email text,
created_at timestamptz,
updated_at timestamptz
```

**`tsa_products` table:**
- `images text[]` — array of local WebP paths
- `price_history jsonb` — [{date, price, original_price}]
- `pros_cons jsonb` — {pros: string[], cons: string[]}
- `availability text` — 'available'|'unavailable'|'limited'
- `last_checked_at timestamptz` — when DataForSEO last validated this product
- `focus_keyword text` — D006

**`analytics_events` — RLS design:**
- `ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;`
- `CREATE POLICY "anon_insert" ON analytics_events FOR INSERT TO anon WITH CHECK (true);`
- No SELECT policy for anon — admin reads via service role, bypasses RLS.

**`domains` — D004 Cloudflare fields:**
- `cf_zone_id text` — Cloudflare zone ID (set after NS delegation)
- `spaceship_id text` — Spaceship registrar reference
- `dns_status text` — 'pending'|'active'|'error'

**`ai_jobs` — BullMQ integration:**
- `job_type text` — 'content_generation'|'site_build'|'product_refresh'|'niche_research'
- `status text` — 'pending'|'running'|'completed'|'failed'
- `payload jsonb` — job input (site_id, config, etc.)
- `result jsonb` — job output (nullable until completed)
- `error text` — failure reason (nullable)
- `bull_job_id text` — BullMQ job ID for correlation

### Extensibility proof (built into schema)

`site_types` seeds with `('tsa', 'TSA (Amazon Affiliate)', 'Amazon affiliate catalog sites')`. Adding `('blog', 'AdSense Blog', '...')` requires only a new row — no structural change. TSA tables (`tsa_categories`, `tsa_products`, `category_products`) all join via `site_id` to `sites`. A future `blog_posts` table would do the same. `sites` table has zero TSA-specific columns.

## Constraints

- **Supabase Cloud project must exist before CLI commands run.** The plan tasks must pause and prompt the user for `SUPABASE_DB_URL` (format: `postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres`). Use `secure_env_collect` for this.
- **Direct connection URL required for `db push`** — not the pooler URL. Supabase docs explicitly state pooler breaks migration tracking. The direct URL is `db.[ref].supabase.co:5432`.
- **`supabase gen types` needs direct DB access too** — same URL works for both commands.
- **No Docker needed** — `--db-url` approach works without local Supabase stack. Confirmed via CLI behavior: connection attempts without config.toml.
- **`packages/db/src/` directory doesn't exist yet** — S02 creates `packages/db/src/types/supabase.ts`. S03 adds the rest.
- **Migration timestamps** — use `20260313000001` through `20260313000007` as prefix. Must be lexicographically orderable; all 7 sort correctly.
- **Postgres version on Supabase Cloud** — currently 15.x. `gen_random_uuid()` available without extension.
- **Port 3004** (from S01 research — not directly relevant to S02 schema, but noted for shared context).

## Common Pitfalls

- **Using pooler URL for `db push`** — transaction pooler mangles prepared statements and breaks the migration tracking. Must use direct connection (`db.[ref].supabase.co:5432`), not `pooler.supabase.com:6543`.
- **Missing `WITH CHECK` on INSERT policy** — `FOR INSERT ... WITH CHECK (true)` is correct; `FOR INSERT ... USING (true)` silently does nothing (USING is for row filtering on read, not write).
- **Forgetting `ENABLE ROW LEVEL SECURITY` before adding policies** — policies are silently ignored if RLS is not enabled on the table. Every table that exposes any anon access must have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- **`text[]` vs `jsonb` for arrays** — use `text[]` for simple string arrays (images, keywords). Use `jsonb` for structured nested data (price_history, pros_cons, customization). Don't jsonb everything.
- **Missing `updated_at` trigger** — Supabase doesn't auto-update `updated_at`. Must either use a trigger or update it in application code. For `sites` (frequently updated), add a `moddatetime` trigger via `supabase_functions.http_request` extension — or simpler: set in application code. Document the choice.
- **supabase gen types overwrites manually-edited files** — `supabase.ts` is always fully regenerated. Never manually edit it. Types are generated from schema; app-level helper types go in `packages/shared`.
- **Seeding `site_types` and `cost_categories` in migrations** — seed data belongs in the migration file that creates the table (not a separate seed file), so `db push` applies it atomically. `supabase db reset` would re-apply everything cleanly.
- **`supabase.ts` must be committed** — per S02 boundary map, the generated types file is committed to the repo. It is NOT gitignored. This is intentional: S03 imports it directly.

## Open Risks

- **Supabase Cloud project not yet created** — the user confirmed Supabase is "cloud project (not local)". No project reference exists in `.env`. The plan must block on user creating the project and providing `SUPABASE_DB_URL` + the three Supabase env vars. This is expected but must be explicit in T01.
- **Schema changes between S02 and later milestones** — the schema is designed for full Phase 1 coverage (through M008). However, if M003/M004 surface missing fields, migrations can be added without redoing S02 — Supabase `db push` applies new migrations incrementally.
- **`analytics_events` partitioning** — PRD mentions "partitioned by month, 90-day retention". Postgres table partitioning in Supabase Cloud is possible but adds complexity. Phase 1 deferral: implement as a regular table with a cron job for cleanup. Add a NOTE in the migration comment. Partitioning can be retrofitted later.
- **`price_history jsonb` unbounded growth** — products accumulate price history indefinitely. Phase 1: no cap. Flag for M006 product refresh slice to implement truncation (keep last N entries).

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Supabase + Postgres | `supabase/agent-skills@supabase-postgres-best-practices` (33.2K installs) | Available — relevant for schema design and RLS patterns |

## Sources

- PRD.md data model section — authoritative schema spec (all tables, fields documented)
- DECISIONS.md — D001, D004, D005, D006, D009, D011 all affect schema shape
- Supabase CLI v2.78.1 `--help` output — confirmed `--db-url` flag on `db push` and `gen types`, no `init` required
- CLI behavior testing — confirmed `db push --db-url` and `gen types --db-url` both attempt connection without requiring `config.toml` (no init needed)
