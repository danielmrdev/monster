"use client";

// ── Score helpers ─────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────
// Overview
// Content — TSA only
// Deploy
// SEO & Alerts

// ── Component ─────────────────────────────────────────────────────────────────

// Read hash on mount (client only)
/* ── Overview ────────────────────────────────────────────────────────── */ /* Logo */ /* Favicon */ /* ── Categories — TSA only ────────────────────────────────────────────── */ /* ── Deploy ──────────────────────────────────────────────────────────── */ /* ── SEO & Alerts ────────────────────────────────────────────────────── */

// ── Local layout helpers ──────────────────────────────────────────────────────

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { Input } from "@/components/ui/input";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SiteCustomization } from "@monster/shared";

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 70) return "text-green-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function gradeBadgeVariant(
  grade: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  switch (grade) {
    case "A":
    case "B":
      return "default";
    case "C":
      return "secondary";
    case "D":
    case "F":
      return "destructive";
    default:
      return "outline";
  }
}

interface SeoScore {
  page_path: string;
  page_type: string | null;
  overall_score: number | null;
  grade: string | null;
  content_quality_score: number | null;
  meta_elements_score: number | null;
  structure_score: number | null;
  links_score: number | null;
  media_score: number | null;
  schema_score: number | null;
  technical_score: number | null;
  social_score: number | null;
}

interface Alert {
  id: string;
  alert_type: string;
  status: string;
  created_at: string;
  tsa_products: { asin: string; title: string | null } | null;
}

interface TabsProps {
  siteId: string;
  site: {
    domain: string | null;
    niche: string | null;
    market: string | null;
    language: string | null;
    currency: string | null;
    affiliate_tag: string | null;
    template_slug: string | null;
    site_type_slug: string | null;
    created_at: string | null;
    updated_at: string | null;
    customization: unknown;
    focus_keyword: string | null;
    homepage_seo_text: string | null;
    homepage_meta_description: string | null;
    homepage_intro: string | null;
  };
  categoriesSlot: React.ReactNode | null;
  deploySlot: React.ReactNode;
  generationSlot: React.ReactNode;
  generationAction: React.ReactNode;
  refreshSlot: React.ReactNode | null;
  refreshAction: React.ReactNode | null;
  deployAction: React.ReactNode;
  seoScores: SeoScore[] | null;
  alerts: Alert[];
  homepageSeoSlot?: React.ReactNode;
  rescoreAction?: React.ReactNode;
}

const VALID_TABS = ["overview", "deploy", "seo", "categories"] as const;
type TabValue = (typeof VALID_TABS)[number];

const TAB_STORAGE_PREFIX = "monster:site-tab:";

function getInitialTab(siteId: string): TabValue {
  if (typeof window === "undefined") return "overview";

  // Fresh entry from sites table — reset to overview
  const url = new URL(window.location.href);
  if (url.searchParams.has("fresh")) {
    try { sessionStorage.removeItem(TAB_STORAGE_PREFIX + siteId); } catch {}
    url.searchParams.delete("fresh");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    return "overview";
  }

  // Hash takes priority (used by back links like #categories, #products)
  const hash = window.location.hash.replace("#", "") as TabValue;
  if (VALID_TABS.includes(hash)) {
    // Persist the hash-based tab so it survives further navigations
    try {
      sessionStorage.setItem(TAB_STORAGE_PREFIX + siteId, hash);
    } catch {}
    return hash;
  }

  // Fall back to sessionStorage (preserves tab across preview/edit navigations)
  try {
    const stored = sessionStorage.getItem(TAB_STORAGE_PREFIX + siteId) as TabValue | null;
    if (stored && VALID_TABS.includes(stored)) return stored;
  } catch {}
  return "overview";
}

export function SiteDetailTabs({
  siteId,
  site,
  categoriesSlot,
  deploySlot,
  deployAction,
  generationSlot,
  generationAction,
  refreshSlot,
  refreshAction,
  seoScores,
  alerts,
  homepageSeoSlot,
  rescoreAction,
}: TabsProps) {
  const customization = site.customization as SiteCustomization | null;
  const isTsa = site.site_type_slug === "tsa";

  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  useEffect(() => {
    setActiveTab(getInitialTab(siteId));
  }, [siteId]);

  function handleTabChange(value: string) {
    const tab = value as TabValue;
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
    try {
      sessionStorage.setItem(TAB_STORAGE_PREFIX + siteId, tab);
    } catch {}
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      <TabsList className={`grid w-full ${isTsa ? "grid-cols-4" : "grid-cols-3"}`}>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="deploy">Deploy</TabsTrigger>
        <TabsTrigger value="seo">SEO &amp; Alerts</TabsTrigger>
        {isTsa && <TabsTrigger value="categories">Categories</TabsTrigger>}
      </TabsList>

      {}
      <TabsContent value="overview" className="space-y-0">
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          <Section title="Site Info">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {(
                [
                  ["Domain", site.domain],
                  ["Niche", site.niche],
                  ["Market", site.market],
                  ["Language", site.language],
                  ["Currency", site.currency],
                  ["Affiliate Tag", site.affiliate_tag],
                  ["Template", site.template_slug],
                  ["Site Type", site.site_type_slug],
                ] as [string, string | null][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm text-foreground">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Customization">
            {customization ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Primary Color</dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
                    {customization.primaryColor ? (
                      <>
                        <span
                          className="inline-block w-4 h-4 rounded-sm border border-border"
                          style={{
                            backgroundColor: customization.primaryColor,
                          }}
                        />
                        {customization.primaryColor}
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Accent Color</dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
                    {customization.accentColor ? (
                      <>
                        <span
                          className="inline-block w-4 h-4 rounded-sm border border-border"
                          style={{ backgroundColor: customization.accentColor }}
                        />
                        {customization.accentColor}
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                {(
                  [
                    ["Heading Font", customization.headingFont],
                    ["Body Font", customization.bodyFont],
                  ] as [string, string | undefined][]
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-sm text-foreground truncate">{value ?? "—"}</dd>
                  </div>
                ))}

                {}
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Logo</dt>
                  <dd className="mt-1">
                    {customization.logoUrl ? (
                      <img
                        src={customization.logoUrl}
                        alt="Site logo"
                        className="h-24 max-w-[320px] object-contain rounded-lg border border-border p-3"
                        style={{ backgroundColor: "#ffffff" }}
                      />
                    ) : (
                      <div className="h-10 w-20 rounded border border-dashed border-border bg-muted/20 flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">No logo</span>
                      </div>
                    )}
                  </dd>
                </div>

                {}
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Favicon</dt>
                  <dd className="mt-1">
                    {customization.faviconUrl ? (
                      <img
                        src={customization.faviconUrl}
                        alt="Site favicon"
                        className="h-8 w-8 object-contain rounded border border-border bg-muted/30 p-1"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded border border-dashed border-border bg-muted/20 flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground">—</span>
                      </div>
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No customization set.</p>
            )}
          </Section>

          <Section title="Metadata">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {(
                [
                  ["Created", site.created_at],
                  ["Updated", site.updated_at],
                ] as [string, string | null][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {value ? new Date(value).toLocaleString() : "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      </TabsContent>

      {}
      {isTsa && (
        <TabsContent value="categories" className="space-y-6">
          {categoriesSlot}
          <Card title="Product Alerts">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open alerts.</p>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm"
                  >
                    <span className="mt-0.5 text-amber-400">⚠</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-foreground capitalize">
                        {alert.alert_type.replace(/_/g, " ")}
                      </span>
                      {alert.tsa_products && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {alert.tsa_products.asin}
                        </span>
                      )}
                      {alert.tsa_products?.title && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {alert.tsa_products.title}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      )}

      {}
      <TabsContent value="deploy" className="space-y-6">
        {generationAction}
        <Card title="Deployment" action={deployAction}>
          {deploySlot}
        </Card>
        {isTsa && refreshSlot !== null && (
          <Card title="Product Refresh" action={refreshAction}>
            {refreshSlot}
          </Card>
        )}
      </TabsContent>

      {}
      <TabsContent value="seo" className="space-y-6">
        <Card title="Homepage SEO">
          <dl className="space-y-4">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Focus Keyword</dt>
              <dd className="mt-1 text-sm text-foreground">{site.focus_keyword ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Meta Description</dt>
              <dd className="mt-1 text-sm text-foreground">
                {site.homepage_meta_description ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Intro</dt>
              <dd className="mt-1 text-sm text-foreground">{site.homepage_intro ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">SEO Text</dt>
              <dd className="mt-2">
                <MarkdownPreview content={site.homepage_seo_text} />
              </dd>
            </div>
          </dl>
          {homepageSeoSlot}
        </Card>

        <SeoScoresTable seoScores={seoScores} rescoreAction={rescoreAction} />

        <Card title="SEO Score Dimensions">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              {
                name: "Content",
                desc: "Word count, keyword density, paragraph structure",
              },
              {
                name: "Meta",
                desc: "Title tag, meta description presence and length",
              },
              { name: "Structure", desc: "H1/H2 heading hierarchy and count" },
              {
                name: "Links",
                desc: "Internal link count and anchor text quality",
              },
              { name: "Media", desc: "Image presence, alt text coverage" },
              { name: "Schema", desc: "JSON-LD / structured data blocks" },
              { name: "Technical", desc: "Canonical tag, noindex, page size" },
              { name: "Social", desc: "Open Graph and Twitter Card tags" },
            ].map(({ name, desc }) => (
              <div key={name} className="flex gap-2 text-sm">
                <span className="font-medium text-foreground shrink-0">{name}:</span>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

const SEO_PAGE_SIZE = 25;

function SeoScoresTable({
  seoScores,
  rescoreAction,
}: {
  seoScores: SeoScore[] | null;
  rescoreAction?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const allScores = useMemo(
    () =>
      (seoScores ?? []).filter((r) => !r.page_path.startsWith("/go/") && r.page_type !== "legal"),
    [seoScores],
  );

  const filtered = useMemo(() => {
    let rows = allScores;
    if (typeFilter !== "all") rows = rows.filter((r) => r.page_type === typeFilter);
    if (gradeFilter !== "all") {
      const belowGrades: Record<string, Set<string>> = {
        "<A": new Set(["B", "C", "D", "F"]),
        "<B": new Set(["C", "D", "F"]),
        "<C": new Set(["D", "F"]),
      };
      const allowed = belowGrades[gradeFilter];
      if (allowed) rows = rows.filter((r) => r.grade !== null && allowed.has(r.grade));
    }
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      rows = rows.filter((r) => r.page_path.toLowerCase().includes(q));
    }
    return rows;
  }, [allScores, typeFilter, gradeFilter, debouncedQuery]);

  const totalPages = Math.ceil(filtered.length / SEO_PAGE_SIZE);
  const pageRows = filtered.slice((page - 1) * SEO_PAGE_SIZE, page * SEO_PAGE_SIZE);

  const from = filtered.length === 0 ? 0 : (page - 1) * SEO_PAGE_SIZE + 1;
  const to = Math.min(page * SEO_PAGE_SIZE, filtered.length);

  const types = useMemo(() => {
    const set = new Set(allScores.map((r) => r.page_type ?? "other"));
    return ["all", ...Array.from(set).sort()];
  }, [allScores]);

  if (!allScores.length) {
    return (
      <Card title="SEO Scores" action={rescoreAction}>
        <p className="text-sm text-muted-foreground">
          No SEO scores yet — generate the site first.
        </p>
      </Card>
    );
  }

  return (
    <Card title="SEO Scores" action={rescoreAction}>
      {/* Filters row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Input
          type="search"
          placeholder="Filter by path…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 text-sm w-56"
        />
        <div className="flex items-center gap-1">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTypeFilter(t);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                typeFilter === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-border"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {["all", "<A", "<B", "<C"].map((g) => (
            <button
              key={g}
              onClick={() => {
                setGradeFilter(g);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                gradeFilter === g
                  ? "bg-amber-500 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-border"
              }`}
            >
              {g === "all" ? "All grades" : g}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filtered.length} pages
        </span>
      </div>

      {/* Table */}
      {pageRows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No pages match the filter.</p>
      ) : (
        <div className="overflow-x-auto -mx-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border min-w-[200px]">
                  Page
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead className="text-xs text-right">Content</TableHead>
                <TableHead className="text-xs text-right">Meta</TableHead>
                <TableHead className="text-xs text-right">Structure</TableHead>
                <TableHead className="text-xs text-right">Links</TableHead>
                <TableHead className="text-xs text-right">Media</TableHead>
                <TableHead className="text-xs text-right">Schema</TableHead>
                <TableHead className="text-xs text-right">Technical</TableHead>
                <TableHead className="text-xs text-right">Social</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.page_path}>
                  <TableCell className="sticky left-0 z-10 bg-card font-mono text-xs after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border min-w-[200px] max-w-[280px] truncate">
                    {row.page_path}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.page_type ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-semibold tabular-nums ${scoreColor(row.overall_score)}`}>
                      {row.overall_score ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={gradeBadgeVariant(row.grade)}>{row.grade ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-right">
                    {row.content_quality_score ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-right">
                    {row.meta_elements_score ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-right">
                    {row.structure_score ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-right">
                    {row.links_score ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-right">
                    {row.media_score ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-right">
                    {row.schema_score ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-right">
                    {row.technical_score ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-right">
                    {row.social_score ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground tabular-nums">
            {from}–{to} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="px-2 text-xs text-muted-foreground tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}
