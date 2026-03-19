import Cloudflare from "cloudflare";
import { createServiceClient } from "@monster/db";

// ---------------------------------------------------------------------------
// CloudflareClient
// ---------------------------------------------------------------------------
// Covers the three steps needed to bring a site to the Cloudflare edge:
//   1. ensureZone()     — create or retrieve CF zone (idempotent, D066)
//   2. ensureARecord()  — upsert proxied A record pointing to VPS2
//   3. pollSslStatus()  — check Universal SSL certificate readiness
//
// Credentials follow the D028 pattern: read from Supabase `settings` table
// at call time — never cached, never logged.
// ---------------------------------------------------------------------------

export class CloudflareClient {
  // ── Credential helper (D028) ─────────────────────────────────────────────

  private async fetchApiToken(): Promise<string> {
    const db = createServiceClient();
    const { data, error } = await db
      .from("settings")
      .select("value")
      .eq("key", "cloudflare_api_token")
      .single();

    if (error || !data) {
      throw new Error(
        "[CloudflareClient] cloudflare_api_token not configured — add it in admin Settings",
      );
    }

    const token = (data.value as { value: string }).value;
    if (!token || typeof token !== "string") {
      throw new Error(
        '[CloudflareClient] cloudflare_api_token malformed — expected { value: "..." } in settings',
      );
    }

    return token;
  }

  // ── ensureZone ───────────────────────────────────────────────────────────

  /**
   * Idempotently creates or retrieves the Cloudflare zone for `domain`.
   * Returns the zone ID and assigned nameservers.
   *
   * If a zone already exists for the domain, returns it without creating another
   * (D066 — duplicate-safe).
   */
  async ensureZone(domain: string): Promise<{ zoneId: string; nameservers: string[] }> {
    const apiToken = await this.fetchApiToken();
    const client = new Cloudflare({ apiToken });

    console.log(`[CloudflareClient] ensureZone: looking up zone for domain="${domain}"`);

    const listPage = await client.zones.list({ name: domain });
    const existing = listPage.result[0];

    if (existing) {
      console.log(
        `[CloudflareClient] ensureZone: found existing zone id="${existing.id}" nameservers=${JSON.stringify(existing.name_servers)}`,
      );
      return { zoneId: existing.id, nameservers: existing.name_servers };
    }

    console.log(
      `[CloudflareClient] ensureZone: no existing zone — creating zone for domain="${domain}"`,
    );

    const created = await client.zones.create({
      account: {},
      name: domain,
      type: "full",
    });

    console.log(
      `[CloudflareClient] ensureZone: created zone id="${created.id}" nameservers=${JSON.stringify(created.name_servers)}`,
    );

    return { zoneId: created.id, nameservers: created.name_servers };
  }

  // ── ensureARecord ────────────────────────────────────────────────────────

  /**
   * Idempotently upserts a proxied A record for `domain` pointing to `vps2Ip`.
   *
   * If a correct record already exists, skips. If a record with a different IP
   * exists, deletes it first then creates the correct one.
   */
  async ensureARecord(zoneId: string, vps2Ip: string, domain: string): Promise<void> {
    const apiToken = await this.fetchApiToken();
    const client = new Cloudflare({ apiToken });

    console.log(
      `[CloudflareClient] ensureARecord: checking A records for domain="${domain}" zoneId="${zoneId}"`,
    );

    const listPage = await client.dns.records.list({
      zone_id: zoneId,
      type: "A",
      name: { exact: domain },
    });

    const existing = listPage.result[0];

    if (existing) {
      if (existing.content === vps2Ip) {
        console.log(
          `[CloudflareClient] ensureARecord: A record already correct (content="${vps2Ip}") — skipping`,
        );
        return;
      }

      console.log(
        `[CloudflareClient] ensureARecord: stale A record found (content="${existing.content}") — deleting id="${existing.id}"`,
      );
      await client.dns.records.delete(existing.id, { zone_id: zoneId });
    }

    console.log(
      `[CloudflareClient] ensureARecord: creating A record domain="${domain}" content="${vps2Ip}" proxied=true`,
    );

    await client.dns.records.create({
      zone_id: zoneId,
      type: "A",
      name: domain,
      content: vps2Ip,
      ttl: 1,
      proxied: true,
    });

    console.log(`[CloudflareClient] ensureARecord: A record created successfully`);
  }

  // ── pollSslStatus ────────────────────────────────────────────────────────

  /**
   * Checks Universal SSL certificate status for a zone.
   *
   * Returns `'active'` if at least one certificate has `certificate_status === 'active'`.
   * Returns `'pending'` if the array is empty or no certificate is active yet.
   */
  async pollSslStatus(zoneId: string): Promise<"active" | "pending"> {
    const apiToken = await this.fetchApiToken();
    const client = new Cloudflare({ apiToken });

    console.log(`[CloudflareClient] pollSslStatus: checking SSL for zoneId="${zoneId}"`);

    const verifications = await client.ssl.verification.get({ zone_id: zoneId });

    if (!verifications || verifications.length === 0) {
      console.log(`[CloudflareClient] pollSslStatus: no verification records — status=pending`);
      return "pending";
    }

    const hasActive = verifications.some((v) => v.certificate_status === "active");

    console.log(
      `[CloudflareClient] pollSslStatus: ${verifications.length} verification record(s), hasActive=${hasActive}`,
    );

    return hasActive ? "active" : "pending";
  }
}
