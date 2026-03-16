import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { ResearchReport } from '@monster/shared';

// ---------------------------------------------------------------------------
// ResearchReportViewer — server component
//
// Renders a completed NicheResearcher report in full.
// Props:
//   report  — validated ResearchReport (caller must run safeParse first)
//   domains — per-domain availability resolved via Promise.allSettled() in page.tsx
//
// Observability:
//   - Domain badge states (Available/Taken/Unknown) reflect live Spaceship checks done in page.tsx.
//   - If all domains show "Unknown", check server logs for [SpaceshipClient] credential errors.
//   - This component never calls external APIs — all async work is done by the parent.
// ---------------------------------------------------------------------------

interface DomainResult {
  domain: string;
  available: boolean | null;
  price?: string;
}

interface Props {
  report: ResearchReport;
  domains: DomainResult[];
}

function viabilityVariant(score: number): 'default' | 'secondary' | 'destructive' {
  if (score >= 70) return 'default';   // green-ish (primary)
  if (score >= 40) return 'secondary'; // yellow-ish
  return 'destructive';                // red
}

function domainBadge(available: boolean | null): { label: string; className: string } {
  if (available === true)  return { label: 'Available', className: 'bg-green-100 text-green-800 border-green-200' };
  if (available === false) return { label: 'Taken',     className: 'bg-muted/50 text-muted-foreground border-border'   };
  return                          { label: 'Unknown',   className: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
}

export default function ResearchReportViewer({ report, domains }: Props) {
  const {
    niche_idea,
    market,
    generated_at,
    viability_score,
    summary,
    recommendation,
    keywords,
    competitors,
    amazon_products,
    domain_suggestions,
  } = report;

  const generatedDate = new Date(generated_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const ctaHref = `/sites/new?niche=${encodeURIComponent(niche_idea)}&market=${encodeURIComponent(market)}`;

  // Build a lookup from domain name → resolved availability result
  const domainLookup = new Map<string, DomainResult>(
    domains.map((d) => [d.domain, d]),
  );

  return (
    <div className="space-y-8">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold tracking-tight truncate">{niche_idea}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{generatedDate}</p>
        </div>
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200">
          {market}
        </span>
      </div>

      {/* ── Viability score ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-col items-center gap-1">
          <Badge
            variant={viabilityVariant(viability_score)}
            className="text-2xl font-bold h-auto px-4 py-1.5 rounded-lg"
          >
            {viability_score}
          </Badge>
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
            Viability Score
          </span>
        </div>
        <div className="text-sm text-muted-foreground leading-relaxed">
          {viability_score >= 70
            ? 'Strong niche — good search volume and monetization potential.'
            : viability_score >= 40
            ? 'Moderate niche — may need more differentiation to rank.'
            : 'Weak niche — high competition or low search volume.'}
        </div>
      </div>

      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Summary</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
      </section>

      {/* ── Recommendation ──────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Recommendation</h3>
        <div className="rounded-md border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm leading-relaxed">
          {recommendation}
        </div>
      </section>

      {/* ── Keywords table ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Keywords <span className="font-normal text-muted-foreground">({keywords.length})</span>
        </h3>
        {keywords.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keywords found.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Keyword</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Volume</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">CPC</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Competition</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {keywords.map((kw, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{kw.keyword}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {kw.search_volume != null ? kw.search_volume.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {kw.cpc != null ? `$${kw.cpc.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {kw.competition != null ? `${(kw.competition * 100).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Competitors ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Competitors <span className="font-normal text-muted-foreground">({competitors.length})</span>
        </h3>
        {competitors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No competitors found.</p>
        ) : (
          <ol className="space-y-2">
            {competitors.map((c, i) => (
              <li key={i} className="flex items-center gap-3 rounded-md border px-4 py-2.5 text-sm">
                <span className="w-6 flex-shrink-0 text-center text-xs font-mono text-muted-foreground">
                  {i + 1}
                </span>
                <span className="flex-1 font-medium truncate">{c.domain}</span>
                <span className="text-xs text-muted-foreground">
                  pos {c.median_position != null ? c.median_position : '—'}
                </span>
                <span className="text-xs rounded-full bg-muted px-2 py-0.5">{c.relevance}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── Amazon products ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Amazon Products <span className="font-normal text-muted-foreground">({amazon_products.length})</span>
        </h3>
        {amazon_products.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products found.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {amazon_products.map((p) => (
              <div key={p.asin} className="rounded-md border bg-card p-4 space-y-1.5 shadow-sm">
                <p className="text-sm font-medium leading-snug line-clamp-2">{p.title}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {p.price != null ? `$${p.price.toFixed(2)}` : '—'}
                  </span>
                  <span>⭐ {p.rating.toFixed(1)}</span>
                  <span>{p.review_count.toLocaleString()} reviews</span>
                  {p.is_prime && (
                    <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 font-semibold">
                      Prime
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">{p.asin}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Domain suggestions ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Domain Suggestions{' '}
          <span className="font-normal text-muted-foreground">({domain_suggestions.length})</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Availability checked live via Spaceship at render time.
        </p>
        {domain_suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No domain suggestions.</p>
        ) : (
          <ul className="space-y-2">
            {domain_suggestions.map((s, i) => {
              const resolved = domainLookup.get(s.domain);
              const available = resolved?.available ?? null;
              const price = resolved?.price;
              const badge = domainBadge(available);
              return (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-md border px-4 py-2.5 text-sm"
                >
                  <span className="flex-1 font-mono text-sm">{s.domain}</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  {available === true && price && (
                    <span className="text-xs text-muted-foreground">{price}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Create site CTA ─────────────────────────────────────────────── */}
      <div className="pt-2 border-t">
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
        >
          Create site from this research →
        </Link>
      </div>
    </div>
  );
}
