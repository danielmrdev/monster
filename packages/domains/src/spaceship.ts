import { createServiceClient } from "@monster/db";

// ---------------------------------------------------------------------------
// SpaceshipClient
// ---------------------------------------------------------------------------
// Covers the four Spaceship API operations needed for domain registration:
//   1. checkAvailability()   — check if a domain is available (sync)
//   2. registerDomain()      — register domain and return async operation ID
//   3. pollOperation()       — poll async operation status
//   4. updateNameservers()   — set custom nameservers (sync)
//
// Credentials follow the D028 pattern: read from Supabase `settings` table
// at call time — never cached, never logged.
// Auth: X-Api-Key + X-Api-Secret headers (exact case from Spaceship curl examples).
// Raw fetch (D065) — no npm client exists for Spaceship API.
// ---------------------------------------------------------------------------

const SPACESHIP_BASE_URL = "https://spaceship.dev/api/v1";

interface SpaceshipCredentials {
  apiKey: string;
  apiSecret: string;
}

export class SpaceshipClient {
  // ── Credential helper (D028) ─────────────────────────────────────────────

  private async fetchCredentials(): Promise<SpaceshipCredentials> {
    const db = createServiceClient();

    const { data: keyData, error: keyError } = await db
      .from("settings")
      .select("value")
      .eq("key", "spaceship_api_key")
      .single();

    if (keyError || !keyData) {
      throw new Error(
        "[SpaceshipClient] spaceship_api_key not configured — add it in admin Settings",
      );
    }

    const apiKey = (keyData.value as { value: string }).value;
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error(
        '[SpaceshipClient] spaceship_api_key malformed — expected { value: "..." } in settings',
      );
    }

    const { data: secretData, error: secretError } = await db
      .from("settings")
      .select("value")
      .eq("key", "spaceship_api_secret")
      .single();

    if (secretError || !secretData) {
      throw new Error(
        "[SpaceshipClient] spaceship_api_secret not configured — add it in admin Settings",
      );
    }

    const apiSecret = (secretData.value as { value: string }).value;
    if (!apiSecret || typeof apiSecret !== "string") {
      throw new Error(
        '[SpaceshipClient] spaceship_api_secret malformed — expected { value: "..." } in settings',
      );
    }

    return { apiKey, apiSecret };
  }

  // ── Header builder ───────────────────────────────────────────────────────

  private async buildHeaders(): Promise<Record<string, string>> {
    const { apiKey, apiSecret } = await this.fetchCredentials();
    return {
      "X-Api-Key": apiKey,
      "X-Api-Secret": apiSecret,
      "Content-Type": "application/json",
    };
  }

  // ── checkAvailability ────────────────────────────────────────────────────

  /**
   * Checks whether a domain is available for registration.
   *
   * Calls GET /v1/domains/{domain}/available (synchronous, 200 response).
   * Returns `{ available: true }` if result is "available", `{ available: false }` if taken.
   * For premium domains, also returns the price from the first premiumPricing entry.
   *
   * Rate limit: 5 requests per domain per 300s — safe for on-demand user queries.
   */
  async checkAvailability(domain: string): Promise<{ available: boolean; price?: string }> {
    console.log(`[SpaceshipClient] checkAvailability: domain="${domain}"`);

    const headers = await this.buildHeaders();
    const url = `${SPACESHIP_BASE_URL}/domains/${encodeURIComponent(domain)}/available`;

    const response = await fetch(url, { method: "GET", headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `[SpaceshipClient] checkAvailability: HTTP ${response.status} for domain="${domain}" — ${body}`,
      );
    }

    const data = (await response.json()) as {
      domain: string;
      result: string;
      premiumPricing?: Array<{ price?: string }>;
    };

    const available = data.result === "available";

    let price: string | undefined;
    if (available && data.premiumPricing && data.premiumPricing.length > 0) {
      price = data.premiumPricing[0].price;
    }

    console.log(
      `[SpaceshipClient] checkAvailability: domain="${domain}" result="${data.result}" premium=${!!price}`,
    );

    return { available, ...(price !== undefined ? { price } : {}) };
  }

  // ── registerDomain ───────────────────────────────────────────────────────

  /**
   * Registers a domain via Spaceship (async operation — returns operation ID).
   *
   * Calls POST /v1/domains/{domain} with contacts object.
   * Expects HTTP 202. Reads the operation ID from the `spaceship-async-operationid`
   * response header (NOT the body).
   *
   * Poll the returned `operationId` with `pollOperation()` to track completion.
   * Only call `updateNameservers()` after `pollOperation()` returns `'success'`.
   */
  async registerDomain(domain: string, contactId: string): Promise<{ operationId: string }> {
    console.log(`[SpaceshipClient] registerDomain: domain="${domain}" contactId="${contactId}"`);

    const headers = await this.buildHeaders();
    const url = `${SPACESHIP_BASE_URL}/domains/${encodeURIComponent(domain)}`;

    const body = {
      contacts: {
        registrant: contactId,
        admin: contactId,
        tech: contactId,
        billing: contactId,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (response.status !== 202) {
      const responseBody = await response.text();
      throw new Error(
        `[SpaceshipClient] registerDomain: HTTP ${response.status} for domain="${domain}" — ${responseBody}`,
      );
    }

    const operationId = response.headers.get("spaceship-async-operationid");

    if (!operationId) {
      throw new Error(
        `[SpaceshipClient] registerDomain: missing spaceship-async-operationid header in 202 response for domain="${domain}"`,
      );
    }

    console.log(
      `[SpaceshipClient] registerDomain: domain="${domain}" operationId="${operationId}"`,
    );

    return { operationId };
  }

  // ── pollOperation ────────────────────────────────────────────────────────

  /**
   * Polls the status of an async Spaceship operation.
   *
   * Calls GET /v1/async-operations/{operationId}.
   * Returns the `status` field from the response: `'pending'`, `'success'`, or `'failed'`.
   *
   * Rate limit: 60 requests per user per 300s — safe to poll with 2s intervals.
   */
  async pollOperation(operationId: string): Promise<"pending" | "success" | "failed"> {
    console.log(`[SpaceshipClient] pollOperation: operationId="${operationId}"`);

    const headers = await this.buildHeaders();
    const url = `${SPACESHIP_BASE_URL}/async-operations/${encodeURIComponent(operationId)}`;

    const response = await fetch(url, { method: "GET", headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `[SpaceshipClient] pollOperation: HTTP ${response.status} for operationId="${operationId}" — ${body}`,
      );
    }

    const data = (await response.json()) as {
      status: "pending" | "success" | "failed";
      type?: string;
      details?: unknown;
      createdAt?: string;
      modifiedAt?: string;
    };

    console.log(
      `[SpaceshipClient] pollOperation: operationId="${operationId}" status="${data.status}"`,
    );

    return data.status;
  }

  // ── updateNameservers ────────────────────────────────────────────────────

  /**
   * Updates the nameservers for a registered domain (synchronous — no async polling).
   *
   * Calls PUT /v1/domains/{domain}/nameservers with `{ provider: 'custom', hosts: nameservers }`.
   * Expects HTTP 200. Throws on any non-200 status.
   *
   * Cloudflare always assigns exactly 2 nameservers — satisfies Spaceship's 2-12 host constraint.
   * IMPORTANT: Only call after `pollOperation()` returns `'success'` for domain registration.
   */
  async updateNameservers(domain: string, nameservers: string[]): Promise<void> {
    console.log(
      `[SpaceshipClient] updateNameservers: domain="${domain}" nameservers=${JSON.stringify(nameservers)}`,
    );

    const headers = await this.buildHeaders();
    const url = `${SPACESHIP_BASE_URL}/domains/${encodeURIComponent(domain)}/nameservers`;

    const body = {
      provider: "custom",
      hosts: nameservers,
    };

    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `[SpaceshipClient] updateNameservers: HTTP ${response.status} for domain="${domain}" — ${responseBody}`,
      );
    }

    console.log(`[SpaceshipClient] updateNameservers: domain="${domain}" updated successfully`);
  }
}
