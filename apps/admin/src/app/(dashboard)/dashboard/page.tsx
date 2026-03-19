import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function fmt(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default async function DashboardPage() {
  const supabase = createServiceClient();
  const { from, to } = monthRange();

  const [
    { count: totalSites, error: e1 },
    { count: liveSites, error: e2 },
    { count: draftSites, error: e3 },
    { count: openAlerts, error: e4 },
    failedJobsResult,
    topSitesResult,
    monthCostsResult,
    monthRevenueAmazonResult,
    monthRevenueManualResult,
    sitesForNameResult,
  ] = await Promise.all([
    supabase.from("sites").select("*", { count: "exact", head: true }),
    supabase.from("sites").select("*", { count: "exact", head: true }).eq("status", "live"),
    supabase.from("sites").select("*", { count: "exact", head: true }).eq("status", "draft"),
    supabase
      .from("product_alerts")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
    // Last 5 failed jobs with site name
    supabase
      .from("ai_jobs")
      .select("id, job_type, error, started_at, site_id, sites(name)")
      .eq("status", "failed")
      .order("started_at", { ascending: false })
      .limit(5),
    // Top 5 sites by total pageviews from analytics_daily
    supabase
      .from("analytics_daily")
      .select("site_id, pageviews")
      .order("pageviews", { ascending: false }),
    // This month costs
    supabase.from("costs").select("amount").gte("date", from).lte("date", to),
    // This month Amazon revenue
    supabase.from("revenue_amazon").select("earnings").gte("date", from).lte("date", to),
    // This month manual revenue
    supabase.from("revenue_manual").select("amount").gte("date", from).lte("date", to),
    // Sites for name lookup in top sites
    supabase.from("sites").select("id, name"),
  ]);

  if (e1) throw new Error("Failed to fetch dashboard KPIs (total sites): " + e1.message);
  if (e2) throw new Error("Failed to fetch dashboard KPIs (live sites): " + e2.message);
  if (e3) throw new Error("Failed to fetch dashboard KPIs (draft sites): " + e3.message);
  if (e4) throw new Error("Failed to fetch dashboard KPIs (open alerts): " + e4.message);

  const alertCount = openAlerts ?? 0;

  const kpis = [
    { label: "Total Sites", value: totalSites ?? 0 },
    { label: "Live Sites", value: liveSites ?? 0 },
    { label: "Draft Sites", value: draftSites ?? 0 },
    { label: "Open Alerts", value: alertCount, isAlerts: true },
  ];

  // Failed jobs
  const failedJobs = failedJobsResult.data ?? [];

  // Top sites by pageviews — aggregate in memory
  type SitePageviews = { site_id: string; total: number };
  const pvBySite = new Map<string, number>();
  for (const row of topSitesResult.data ?? []) {
    pvBySite.set(row.site_id, (pvBySite.get(row.site_id) ?? 0) + row.pageviews);
  }
  const siteNameById = new Map((sitesForNameResult.data ?? []).map((s) => [s.id, s.name]));
  const topSites: SitePageviews[] = [...pvBySite.entries()]
    .map(([site_id, total]) => ({ site_id, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // P&L this month
  const totalCosts = (monthCostsResult.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalRevenue =
    (monthRevenueAmazonResult.data ?? []).reduce((s, r) => s + (r.earnings ?? 0), 0) +
    (monthRevenueManualResult.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  const profit = totalRevenue - totalCosts;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, isAlerts }) => {
          const hasAlerts = isAlerts && alertCount > 0;
          return (
            <Card key={label} className={hasAlerts ? "border-amber-400" : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                {isAlerts ? (
                  <div className="flex items-end justify-between">
                    <p className={`text-3xl font-bold${hasAlerts ? " text-amber-500" : ""}`}>
                      {value}
                    </p>
                    {alertCount > 0 && (
                      <Link
                        href="/alerts"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View all →
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="text-3xl font-bold">{value}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* P&L this month */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">This Month — P&amp;L</CardTitle>
          </CardHeader>
          <CardContent>
            {totalRevenue === 0 && totalCosts === 0 ? (
              <p className="text-sm text-muted-foreground">No financial data this month yet.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Revenue</span>
                  <span className="font-mono">{fmtCurrency(totalRevenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Costs</span>
                  <span className="font-mono text-red-400">−{fmtCurrency(totalCosts)}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between text-sm font-semibold">
                  <span>Profit</span>
                  <span
                    className={`font-mono ${profit > 0 ? "text-green-400" : profit < 0 ? "text-red-400" : "text-muted-foreground"}`}
                  >
                    {fmtCurrency(profit)}
                  </span>
                </div>
                <Link
                  href="/finances"
                  className="block text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
                >
                  Full P&amp;L →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top sites by pageviews */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Sites by Pageviews</CardTitle>
          </CardHeader>
          <CardContent>
            {topSites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No analytics data yet.</p>
            ) : (
              <div className="space-y-1.5">
                {topSites.map(({ site_id, total }) => (
                  <div key={site_id} className="flex justify-between items-center text-sm">
                    <Link
                      href={`/sites/${site_id}`}
                      className="text-foreground hover:text-primary transition-colors truncate max-w-[60%]"
                    >
                      {siteNameById.get(site_id) ?? "Unknown"}
                    </Link>
                    <span className="font-mono text-muted-foreground text-xs">
                      {total.toLocaleString()}
                    </span>
                  </div>
                ))}
                <Link
                  href="/analytics"
                  className="block text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
                >
                  Full analytics →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Failed jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Failed Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {failedJobs.length === 0 ? (
            <p className="text-sm text-green-400">✓ No failed jobs</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-1.5 pr-4 font-medium">Site</th>
                    <th className="text-left py-1.5 pr-4 font-medium">Job Type</th>
                    <th className="text-left py-1.5 pr-4 font-medium">When</th>
                    <th className="text-left py-1.5 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {failedJobs.map((job) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const siteName = (job.sites as any)?.name ?? "—";
                    return (
                      <tr key={job.id}>
                        <td className="py-2 pr-4 text-foreground">
                          {job.site_id ? (
                            <Link
                              href={`/sites/${job.site_id}`}
                              className="hover:text-primary transition-colors"
                            >
                              {siteName}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">
                          {job.job_type}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs whitespace-nowrap">
                          {fmt(job.started_at)}
                        </td>
                        <td
                          className="py-2 text-red-400 text-xs font-mono truncate max-w-[300px]"
                          title={job.error ?? ""}
                        >
                          {job.error ? job.error.slice(0, 80) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
