import { notFound } from "next/navigation";
import Link from "next/link";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { enqueueSiteDeploy, getDeploymentCard } from "./actions";
import { RefreshButton, RefreshInfo } from "./RefreshCard";
import { GenerateSitePanel } from "./GenerateSitePanel";
import { HomepageSeoPanel } from "./HomepageSeoPanel";
import DeployStatus from "./DeployStatus";
import { CategoriesSection } from "./CategoriesSection";
import { SiteDetailTabs } from "./SiteDetailTabs";
import { RescoreSiteButton } from "./RescoreSiteButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SiteDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: site, error } = await supabase.from("sites").select("*").eq("id", id).single();

  if (error || !site) notFound();

  // Check if a generated dist/ exists for the Preview button
  const GENERATOR_ROOT = join(process.cwd(), "..", "generator");
  const siteSlug = site.domain ? site.domain.replace(/\./g, "-") : null;
  const hasPreview = siteSlug
    ? existsSync(join(GENERATOR_ROOT, ".generated-sites", siteSlug, "dist", "index.html"))
    : false;

  const isTsa = site.site_type_slug === "tsa";

  const [seoScoresResult, deployCard, siteAlertsResult, categoriesResult] = await Promise.all([
    supabase
      .from("seo_scores")
      .select(
        "page_path, page_type, overall_score, grade, content_quality_score, meta_elements_score, structure_score, links_score, media_score, schema_score, technical_score, social_score",
      )
      .eq("site_id", id)
      .order("page_path", { ascending: true }),
    getDeploymentCard(id),
    isTsa
      ? supabase
          .from("product_alerts")
          .select("*, tsa_products(asin, title)")
          .eq("site_id", id)
          .eq("status", "open")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    isTsa
      ? supabase
          .from("tsa_categories")
          .select(
            "id, name, slug, focus_keyword, keywords, seo_text, description, category_products(count)",
          )
          .eq("site_id", id)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (siteAlertsResult.error) throw siteAlertsResult.error;

  const categories = (categoriesResult.data ?? []).map((cat) => ({
    ...cat,
    productCount: (cat.category_products as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }));

  const statusBadge = (status: string | null) => {
    const s = status ?? "draft";
    const map: Record<string, string> = {
      active: "bg-green-500/15 text-green-400 ring-1 ring-green-500/30",
      live: "bg-green-500/15 text-green-400 ring-1 ring-green-500/30",
      draft: "bg-white/8 text-muted-foreground ring-1 ring-white/10",
      error: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
      deploying: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30",
      running: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30",
      dns_pending: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
      ssl_pending: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
      paused: "bg-white/8 text-muted-foreground ring-1 ring-white/10",
      succeeded: "bg-green-500/15 text-green-400 ring-1 ring-green-500/30",
      failed: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
    };
    return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[s] ?? map.draft}`;
  };

  // ── Deploy tab content (server-rendered) ────────────────────────────────────
  const deployAction = site.domain ? (
    <form
      action={async () => {
        "use server";
        await enqueueSiteDeploy(site.id);
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Deploy
      </button>
    </form>
  ) : (
    <button
      type="button"
      disabled
      title="Set a domain first"
      className="inline-flex items-center rounded-md bg-primary/30 px-4 py-2 text-sm font-medium text-primary-foreground/50 cursor-not-allowed"
    >
      Deploy
    </button>
  );

  const deploySlot = (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Pipeline status:</span>
        <span className={statusBadge(deployCard.siteStatus)}>
          {deployCard.siteStatus ?? "draft"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Refresh interval:</span>
        <span className="text-sm">{Math.round(site.refresh_interval_hours / 24)} days</span>
      </div>

      {deployCard.latestDeployment ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">Last deployment:</span>
            <span className={statusBadge(deployCard.latestDeployment.status)}>
              {deployCard.latestDeployment.status}
            </span>
          </div>
          {deployCard.latestDeployment.deployed_at && (
            <div className="text-muted-foreground">
              <span className="font-medium">Deployed:</span>{" "}
              {new Date(deployCard.latestDeployment.deployed_at).toLocaleString()}
            </div>
          )}
          {deployCard.latestDeployment.duration_ms != null && (
            <div className="text-muted-foreground">
              <span className="font-medium">Duration:</span>{" "}
              {Math.round(deployCard.latestDeployment.duration_ms / 1000)}s
            </div>
          )}
          {deployCard.latestDeployment.error && (
            <div className="text-red-400 text-xs font-mono break-all">
              {deployCard.latestDeployment.error}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No deployments yet.</p>
      )}

      {deployCard.domain?.cf_nameservers && deployCard.domain.cf_nameservers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Point your domain to these nameservers:
          </p>
          <ul className="space-y-0.5">
            {deployCard.domain.cf_nameservers.map((ns) => (
              <li
                key={ns}
                className="font-mono text-xs text-foreground bg-muted/40 rounded px-2 py-1 border border-border"
              >
                {ns}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DeployStatus siteId={site.id} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/sites"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Sites
          </Link>
          <span className={statusBadge(site.status)}>{site.status ?? "draft"}</span>
          {!site.is_active && (
            <span className="inline-flex items-center rounded-full border border-muted-foreground/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              inactive
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasPreview ? (
            <Link
              href={`/sites/${site.id}/preview`}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Preview
            </Link>
          ) : (
            <span
              title="Generate the site first"
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary/40 px-4 py-2 text-sm font-medium text-secondary-foreground/40 cursor-not-allowed"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Preview
            </span>
          )}
          <Link
            href={`/sites/${site.id}/edit`}
            className="inline-flex items-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Tabbed content */}
      <SiteDetailTabs
        site={{
          domain: site.domain,
          niche: site.niche,
          market: site.market,
          language: site.language,
          currency: site.currency,
          affiliate_tag: site.affiliate_tag,
          template_slug: site.template_slug,
          site_type_slug: site.site_type_slug,
          created_at: site.created_at,
          updated_at: site.updated_at,
          customization: site.customization,
          focus_keyword: site.focus_keyword,
          homepage_seo_text: site.homepage_seo_text,
          homepage_meta_description:
            ((site as Record<string, unknown>).homepage_meta_description as string | null) ?? null,
          homepage_intro:
            ((site as Record<string, unknown>).homepage_intro as string | null) ?? null,
        }}
        categoriesSlot={isTsa ? <CategoriesSection siteId={id} categories={categories} /> : null}
        generationAction={<GenerateSitePanel siteId={site.id} domain={site.domain} />}
        generationSlot={null}
        deployAction={deployAction}
        deploySlot={deploySlot}
        refreshAction={isTsa ? <RefreshButton siteId={site.id} /> : null}
        refreshSlot={
          isTsa ? <RefreshInfo lastRefreshedAt={site.last_refreshed_at ?? null} /> : null
        }
        seoScores={seoScoresResult.data ?? null}
        alerts={siteAlertsResult.data ?? []}
        rescoreAction={<RescoreSiteButton siteId={site.id} />}
        homepageSeoSlot={
          <HomepageSeoPanel
            siteId={site.id}
            currentContent={{
              focus_keyword: site.focus_keyword ?? null,
              meta_description:
                ((site as Record<string, unknown>).homepage_meta_description as string | null) ??
                null,
              intro: ((site as Record<string, unknown>).homepage_intro as string | null) ?? null,
              seo_text: site.homepage_seo_text ?? null,
            }}
            currentScore={
              (seoScoresResult.data ?? []).find((s) => s.page_path === "/")
                ?.content_quality_score ?? null
            }
          />
        }
      />
    </div>
  );
}
