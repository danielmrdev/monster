---
id: S03-ASSESSMENT
slice: S03
milestone: M002
assessed_at: 2026-03-13
verdict: no_changes_needed
---

# Roadmap Assessment after M002/S03

## Verdict

Roadmap is unchanged. S04 proceeds as planned.

## Success Criterion Coverage

- User can create a TSA site record with all fields and see it in Sites list → ✅ S01 (done)
- User can open site detail view and edit; changes persist → ✅ S01 (done)
- `SiteCustomization` Zod schema defined and validated on create/edit → ✅ S01 (done)
- User can save API keys; retrieved correctly, masked in UI, full value round-trips → ✅ S03 (done)
- Dashboard loads without errors and shows real KPI counts → ✅ S02 (done)
- User can add a cost entry and see it in cost list; Finances page renders → **S04** (sole remaining owner — covered)
- Active nav link highlighted across all 7 routes → ✅ S01 (done)
- All pages functional after pm2 restart → verified slice-by-slice (S01/S02/S03 each confirmed 307 on route after pm2 reload)

All criteria have at least one owning slice. Coverage check passes.

## Risk Retirement

S03 retired its declared risk (medium): `settings` table round-trip works, upsert with `onConflict:'key'` confirmed, masked display verified by code inspection, no raw key value in server-rendered HTML. The `'use server'` constants footgun was hit and resolved as D034 — pattern is now established and documented.

## Boundary Contract Accuracy

S04 boundary is still accurate:
- Server action pattern (iterate fields, skip empty, upsert/insert, `revalidatePath`, return `{ success }` or `{ errors }`) is confirmed and reusable — S03 demonstrated it cleanly.
- `costs` table schema from M001/S02 migrations is untouched.
- No new API surface from S03 that S04 depends on.

One concrete forward-intelligence item for S04: constants shared between a server action and a server component MUST live in a sibling file with no `'use server'` directive (D034). Costs form likely won't need shared constants (no equivalent of `SETTINGS_KEYS`), but the constraint applies if it does.

## Requirement Coverage

No changes to requirement ownership or status. R012 (Finances: cost tracking + P&L) remains correctly owned by M008/S01 as primary. S04 is the shell/foundation — cost entry form and list only, revenue section placeholder. This is correct per D030.

## What S04 Should Know

- Copy the server action pattern from `apps/admin/src/app/(dashboard)/settings/actions.ts` — iterate form fields, skip empty strings, upsert with `{ onConflict: 'id' }` for inserts or standard insert for costs (each cost entry is a new row, not a keyed upsert).
- Cost list is a read in the server component, same pattern as sites list in S01.
- Revenue section: static "Coming soon" — no DB queries, no server action.
- D034 applies if any constants need sharing between the action and the page.
