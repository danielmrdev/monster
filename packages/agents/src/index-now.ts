/**
 * index-now.ts — IndexNow search engine ping after site deployment.
 *
 * IndexNow is a unified standard adopted by Google, Bing, and Yandex.
 * One API call notifies multiple search engines to crawl the updated URL.
 *
 * D133: IndexNow via api.indexnow.org (covers Google + Bing).
 * Key verification: the key file must exist at https://{domain}/{key}.txt
 * — writeSeoFiles() in seo-files.ts writes this file to dist/.
 *
 * Non-fatal: failures are logged as warnings, not thrown.
 */
import { INDEXNOW_KEY } from "./seo-files.js";

/**
 * Ping IndexNow API to request crawling of the site homepage.
 * Non-fatal — logs warning on failure, never throws.
 *
 * @param domain The site's domain without protocol (e.g. 'example.com')
 */
export async function pingIndexNow(domain: string): Promise<void> {
  const url = `https://api.indexnow.org/indexnow?url=https://${domain}/&key=${INDEXNOW_KEY}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "BuilderMonster/1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok || res.status === 202) {
      console.log(`[IndexNow] ping sent for ${domain} — status ${res.status}`);
    } else {
      // 400 = key not yet indexed (normal on first deploy), 422 = URL not from this domain
      console.warn(`[IndexNow] ping for ${domain} returned ${res.status} — non-fatal`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[IndexNow] ping failed for ${domain}: ${msg} — non-fatal`);
  }
}
