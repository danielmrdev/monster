// Analytics tracker — pure browser globals, no imports
// Placeholders replaced by BaseLayout.astro at Astro build time
const SUPABASE_URL = "__SUPABASE_URL__";
const ANON_KEY = "__SUPABASE_ANON_KEY__";
const SITE_ID = "__SITE_ID__";

interface AnalyticsEvent {
  site_id: string;
  event_type: string;
  page_path: string;
  referrer: string;
  visitor_hash: string;
  language: string;
  country: null;
}

const queue: AnalyticsEvent[] = [];
let flushing = false;

async function visitorHash(): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const input = date + navigator.userAgent;
  if (window.isSecureContext && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback: 16-char hex from Math.random
  let h = "";
  while (h.length < 16) h += Math.random().toString(16).slice(2);
  return h.slice(0, 16);
}

function flush(): void {
  if (flushing || queue.length === 0) return;
  const events = queue.splice(0);
  flushing = true;
  fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(events),
  })
    .catch(() => {})
    .finally(() => {
      flushing = false;
    });
}

let hashPromise: Promise<string> | null = null;

function enqueue(type: string): void {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local') || h.endsWith('.test')) return;
  if (location.pathname.startsWith('/api/preview/')) return;
  if (!hashPromise) hashPromise = visitorHash();
  hashPromise.then((visitor_hash) => {
    const ev: AnalyticsEvent = {
      site_id: SITE_ID,
      event_type: type,
      page_path: location.pathname,
      referrer: document.referrer,
      visitor_hash,
      language: navigator.language,
      country: null,
    };
    queue.push(ev);
  });
}

function init(): void {
  enqueue("pageview");

  document.addEventListener("click", (e) => {
    const a = (e.target as Element).closest("[data-affiliate]");
    if (a) enqueue("click_affiliate");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  window.addEventListener("pagehide", flush);

  setInterval(() => {
    if (queue.length > 0) flush();
  }, 5000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
