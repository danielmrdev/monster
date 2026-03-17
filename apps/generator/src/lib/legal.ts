import type { SiteInfo } from "./data";

/**
 * Substitute all `{{placeholder}}` markers in a legal template with real site values.
 *
 * Supported placeholders:
 *   {{site.name}}          → site display name
 *   {{site.domain}}        → site domain (e.g. "example.com")
 *   {{site.contact_email}} → contact email address (empty string if not set)
 *   {{site.affiliate_tag}} → Amazon affiliate tag
 *   {{current_year}}       → current calendar year (e.g. "2026")
 *
 * Called at Astro build time before passing content to `marked()`.
 */
export function interpolateLegal(content: string, site: SiteInfo): string {
  return content
    .replaceAll("{{site.name}}", site.name)
    .replaceAll("{{site.domain}}", site.domain)
    .replaceAll("{{site.contact_email}}", site.contact_email ?? "")
    .replaceAll("{{site.affiliate_tag}}", site.affiliate_tag)
    .replaceAll("{{current_year}}", new Date().getFullYear().toString());
}
