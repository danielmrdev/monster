/**
 * Canonical import path for the Supabase service role client in admin server actions.
 * Always import `createServiceClient` from here — never directly from `@monster/db`.
 * This single re-export makes the import path auditable:
 *   grep -r "createServiceClient" apps/admin/src → all results show this file as source
 *
 * The client throws a descriptive error at call time if SUPABASE_SERVICE_ROLE_KEY
 * is missing (see packages/db/src/client.ts — D021).
 */
export { createServiceClient } from "@monster/db";
