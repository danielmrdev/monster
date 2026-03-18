# S06: VPS Local Mode + Domain Management Relocation — UAT

**Milestone:** M014
**Written:** 2026-03-18

## UAT Type

- UAT mode: live-runtime + artifact-driven
- Why this mode is sufficient: T01 changes require a running server to verify real metric collection; T02 UI changes are verifiable via live admin panel page renders. Artifact-driven checks (migration file, TypeScript build, grep for log strings) cover the code path without needing SSH into a real VPS.

## Preconditions

1. Admin app is running locally (`pnpm --filter @monster/admin dev` or `pm2` process on VPS1)
2. Migration `20260318120000_servers_is_local.sql` has been applied (confirmed in T01 — `npx supabase db push` completed successfully)
3. `is_local=true` set on the hel1 row in the `servers` table (manual operator step — required to exercise the local-mode code path):
   ```bash
   curl -X PATCH "https://<project>.supabase.co/rest/v1/servers?name=eq.hel1" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"is_local": true}'
   ```
4. Admin app can reach the Supabase DB (env vars loaded)

## Smoke Test

Navigate to `/research` in the admin panel. The left column must contain a "Domain Management" card with a domain availability search input. If it renders — the T02 wiring is alive.

---

## Test Cases

### 1. Deploy tab has no Domain Management card

1. Navigate to `/sites/[id]` for any existing site.
2. Click the **Deploy** tab.
3. **Expected:** The Deploy tab shows cards for "Site Generation", "Deployment", and "Product Refresh". There is **no** "Domain Management" card anywhere in the Deploy tab. The tab renders without error.

### 2. Research Lab shows Domain Management availability checker

1. Navigate to `/research`.
2. Scroll the left column.
3. **Expected:** A card labelled "Domain Management" is visible in the left column. It contains a domain availability search form (text input + search button).

### 3. Domain availability check works from Research Lab (no site context)

1. Navigate to `/research`.
2. In the Domain Management card, type a domain name (e.g., `example.com`) into the search field.
3. Submit the form.
4. **Expected:** The card shows a result — either "Available" or "Taken" (or an appropriate error if the Spaceship API is not configured). **No "Approve & Register" button or registration form appears.** The component correctly hides all registration UI when rendered without a `siteId`.

### 4. is_local=true server returns real metrics on /infra

*Precondition: hel1 has `is_local=true` set in the DB.*

1. Navigate to `/infra`.
2. Wait for the fleet health poll to complete (up to 10 seconds).
3. **Expected:** The hel1 server card shows `reachable: true` with numeric values for disk usage and memory. No SSH error message. The values correspond to real local system state (e.g., disk percentage is a number like "42%", not "N/A" or an error string).

### 5. Caddy inactive does not crash local-mode health check

*Precondition: hel1 has `is_local=true`; Caddy may or may not be active.*

1. Navigate to `/infra` and trigger a health poll.
2. Check admin server stdout/logs for the InfraService log line.
3. **Expected:** Log contains `[InfraService] local-mode metrics for "hel1"` (not `local-mode error`). The Caddy status field shows either `"active"` or `"inactive"` — not a thrown exception or undefined. The server card shows `reachable: true` regardless of Caddy's state.

### 6. TypeScript build is clean

```bash
cd apps/admin && npx tsc --noEmit
```

**Expected:** Zero output, exit code 0. No type errors introduced by the optional `siteId` prop change or the Research Lab import.

### 7. Deployment package builds clean

```bash
pnpm --filter @monster/deployment build
```

**Expected:** `ESM Build success` and `DTS Build success` lines in output. Exit code 0.

---

## Edge Cases

### Caddy is inactive on local server

1. Stop Caddy: `sudo systemctl stop caddy` on the admin VPS.
2. Trigger a fleet health poll at `/infra`.
3. **Expected:** hel1 card shows `reachable: true` with Caddy status `"inactive"`. Disk and memory still show real values. No exception thrown, no `local-mode error` log line.

### DomainManagement rendered without siteId (Research Lab)

1. Navigate to `/research`.
2. Inspect the DOM (DevTools) or page source of the Domain Management card.
3. **Expected:** No `<form>` or `<button>` for domain registration is present. No "Approve & Register" text visible. Only the availability check form renders.

### DomainManagement rendered with siteId (if re-added in future)

*This is a regression guard — registration was removed from the Deploy tab.*

1. Confirm via source code that `SiteDetailTabs.tsx` has no `domainSlot` prop:
   ```bash
   grep -c "domainSlot" apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx
   ```
2. **Expected:** Output is `0` (grep exits 1 with count 0 — no matches).

---

## Failure Signals

- `/infra` page shows hel1 as `reachable: false` with an SSH error — `is_local=true` not set on hel1 row, or the flag was set but the admin app didn't restart to pick up the new DB value.
- `/infra` page logs `[InfraService] local-mode error for "hel1": <message>` — one of the `execSync` commands failed; check if `df`, `free`, or `systemctl` is available on the host.
- `/research` page renders without a Domain Management card — import path is wrong or the component is conditionally excluded; check `research/page.tsx` imports.
- "Approve & Register" button visible at `/research` — the `{siteId && (...)}` guard is not wrapping the registration JSX; inspect `DomainManagement.tsx` line ~105.
- `npx tsc --noEmit` produces errors — a prop type mismatch was introduced; look at `DomainManagement` usages.
- `pnpm --filter @monster/deployment build` fails with TS2339 on `is_local` — `@monster/db` was not rebuilt after `supabase.ts` was updated; run `pnpm --filter @monster/db build` first.

---

## Not Proven By This UAT

- That the `execSync` metrics precisely match what `top`/`htop` would show — the parsing logic (`awk` pipelines) is functionally tested but not cross-validated against a second source.
- That the Spaceship availability API call succeeds from Research Lab — depends on the `spaceship_api_key` being configured in settings. The form rendering is verified; the API call is an integration test requiring a live key.
- That `is_local=true` survives a database migration or a `servers` table seed reset — the migration sets DEFAULT false; any re-seed would need to re-apply the flag.
- SSH path for remote servers — S06 does not modify the SSH code path. Existing SSH-based fleet health checks are not regression-tested here.

---

## Notes for Tester

- The most important manual verification is the `/infra` page with `is_local=true` on hel1. All code paths can be verified statically except this one.
- If hel1 is not yet registered in the `servers` table, insert it first via Supabase dashboard, then set `is_local=true`.
- The Research Lab page may already have content from prior research sessions — the Domain Management card will be in the left column below or above existing research UI. Scroll if you don't see it immediately.
- **Registration from site detail is intentionally removed.** If a colleague asks why they can't register a domain from the Deploy tab, this is by design per S06.
- To activate local mode quickly without the Supabase dashboard:
  ```bash
  source apps/admin/.env.local
  curl -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/servers?name=eq.hel1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"is_local": true}'
  ```
