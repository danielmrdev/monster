import { DataForSEOClient } from "@monster/agents";
import { SpaceshipClient } from "@monster/domains";
import { createServiceClient } from "@/lib/supabase/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CostForm } from "./cost-form";
import { RevenueSection } from "./revenue-section";
import { FinancesFilters } from "./finances-filters";
import { PnLExportButton } from "./pnl-export-button";
import { getDateRange, computePnL } from "./lib";

export const dynamic = "force-dynamic";

// D120 pattern: searchParams is a Promise in Next.js 15 App Router
export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const dateRange = getDateRange(from, to);

  const supabase = createServiceClient();

  const [
    costsResult,
    categoriesResult,
    sitesWithDomainResult,
    revenueAmazonResult,
    revenueManualResult,
  ] = await Promise.all([
    supabase
      .from("costs")
      .select("*")
      .gte("date", dateRange.from)
      .lte("date", dateRange.to)
      .order("created_at", { ascending: false }),
    supabase.from("cost_categories").select("slug, name"),
    supabase.from("sites").select("id, name, domain").order("name"),
    supabase
      .from("revenue_amazon")
      .select("id, site_id, date, clicks, items_ordered, earnings, currency, market")
      .gte("date", dateRange.from)
      .lte("date", dateRange.to)
      .order("date", { ascending: false }),
    supabase
      .from("revenue_manual")
      .select("id, site_id, source, amount, currency, date, notes")
      .gte("date", dateRange.from)
      .lte("date", dateRange.to)
      .order("date", { ascending: false }),
  ]);

  if (costsResult.error) {
    throw new Error(`Failed to fetch costs: ${costsResult.error.message}`);
  }
  if (categoriesResult.error) {
    throw new Error(`Failed to fetch cost_categories: ${categoriesResult.error.message}`);
  }
  if (sitesWithDomainResult.error) {
    throw new Error(`Failed to fetch sites: ${sitesWithDomainResult.error.message}`);
  }
  if (revenueAmazonResult.error) {
    throw new Error(`Failed to fetch revenue_amazon: ${revenueAmazonResult.error.message}`);
  }
  if (revenueManualResult.error) {
    throw new Error(`Failed to fetch revenue_manual: ${revenueManualResult.error.message}`);
  }

  const costs = costsResult.data;
  const categories = categoriesResult.data;
  const sites = sitesWithDomainResult.data.map(({ domain: _d, ...rest }) => rest);
  const revenueAmazon = revenueAmazonResult.data;
  const revenueManual = revenueManualResult.data;

  // DataForSEO balance — fetched defensively so errors never throw the page.
  let dfsBalance: number | null = null;
  try {
    dfsBalance = await new DataForSEOClient().getAccountBalance();
  } catch {
    // guard defensively
  }

  // Spaceship domain details — query each domain assigned to a site individually
  // via GET /v1/domains/{domain} (no rate-limit issues unlike the list endpoint).
  const sitesWithDomainAssigned = sitesWithDomainResult.data.filter((s) => s.domain);
  let spaceshipError: string | null = null;
  type SpaceshipDomainInfo = { name: string; expirationDate: string | null; autoRenew: boolean };
  const spaceshipDomains: SpaceshipDomainInfo[] = [];

  if (sitesWithDomainAssigned.length > 0) {
    try {
      const ssClient = new SpaceshipClient();
      const results = await Promise.allSettled(
        sitesWithDomainAssigned.map((s) => ssClient.getDomainDetails(s.domain!)),
      );
      let hasError = false;
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          spaceshipDomains.push(r.value);
        } else if (r.status === "rejected") {
          hasError = true;
          spaceshipError = r.reason?.message ?? "Unknown error";
        }
      }
      if (hasError && spaceshipDomains.length > 0) {
        spaceshipError = null; // partial success — show what we got
      }
    } catch (e: unknown) {
      spaceshipError = e instanceof Error ? e.message : "Unknown error";
    }
  }

  // Compute P&L aggregation (pure in-memory)
  const pnlResult = computePnL(costs, revenueAmazon, revenueManual, sites);

  // Domain renewals — cross-reference sites (with domain assigned) against
  // Spaceship API. Only show domains that actually exist in Spaceship.
  const now = Date.now();
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));

  // Build lookup: domain name → Spaceship data
  const spaceshipByDomain = new Map(spaceshipDomains.map((d) => [d.name, d]));

  // Sites that have a domain assigned AND that domain exists in Spaceship
  const domainRenewals = sitesWithDomainResult.data
    .filter((s) => s.domain && spaceshipByDomain.has(s.domain))
    .map((s) => {
      const ss = spaceshipByDomain.get(s.domain!)!;
      const expiresDate = ss.expirationDate ? new Date(ss.expirationDate).getTime() : null;
      const daysRemaining = expiresDate
        ? Math.floor((expiresDate - now) / (1000 * 60 * 60 * 24))
        : null;
      return {
        id: s.id,
        domain: s.domain!,
        siteName: s.name,
        expirationDate: ss.expirationDate,
        autoRenew: ss.autoRenew,
        daysRemaining,
      };
    })
    .sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999));

  // Build a revenue row list for the Revenue History section
  type RevenueRow = {
    key: string;
    date: string;
    source: string;
    siteName: string;
    amount: number;
    currency: string;
    notes: string;
  };

  const revenueRows: RevenueRow[] = [
    ...revenueAmazon.map((r) => ({
      key: `amazon-${r.id}`,
      date: r.date,
      source: `Amazon (${r.market})`,
      siteName: r.site_id ? (siteNameById.get(r.site_id) ?? "Unknown") : "Portfolio-wide",
      amount: r.earnings,
      currency: r.currency,
      notes: `${r.clicks} clicks, ${r.items_ordered} ordered`,
    })),
    ...revenueManual.map((r) => ({
      key: `manual-${r.id}`,
      date: r.date,
      source: r.source || "Manual",
      siteName: r.site_id ? (siteNameById.get(r.site_id) ?? "Unknown") : "Portfolio-wide",
      amount: r.amount,
      currency: r.currency,
      notes: r.notes || "—",
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // Formatters
  const fmtEUR = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR" });
  const fmtUSD = (n: number) => n.toLocaleString("en", { style: "currency", currency: "USD" });

  const profitColor = (n: number) =>
    n >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";

  const roiColor = (roi: number | null) => {
    if (roi === null) return "text-muted-foreground";
    return roi > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  };

  const daysRemainingColor = (days: number) => {
    if (days <= 14) return "text-red-600 dark:text-red-400 font-semibold";
    if (days <= 30) return "text-amber-600 dark:text-amber-400 font-medium";
    return "text-yellow-600 dark:text-yellow-400";
  };

  return (
    <div className="space-y-6">
      {/* Date range filter */}
      <FinancesFilters defaultFrom={dateRange.from} defaultTo={dateRange.to} />

      {/* ── DataForSEO Balance card ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>DataForSEO Balance (USD)</CardTitle>
        </CardHeader>
        <CardContent>
          {dfsBalance !== null ? (
            <div className="space-y-1">
              <p className="text-3xl font-bold font-mono">{fmtUSD(dfsBalance)}</p>
              <p className="text-sm text-muted-foreground">
                Available balance in your DataForSEO account
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not configured — add DataForSEO credentials in{" "}
              <a href="/settings" className="underline">
                Settings
              </a>
              .
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── P&L Summary card ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            P&L Summary — {dateRange.from} to {dateRange.to}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold">{fmtEUR(pnlResult.portfolioRevenue)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Costs</p>
              <p className="text-2xl font-bold">{fmtEUR(pnlResult.portfolioCosts)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Net Profit</p>
              <p className={`text-2xl font-bold ${profitColor(pnlResult.portfolioProfit)}`}>
                {fmtEUR(pnlResult.portfolioProfit)}
              </p>
            </div>
          </div>

          {pnlResult.mixedCurrencies && (
            <p className="mt-4 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
              ⚠ Revenue or costs include non-EUR entries — amounts shown in their original currency,
              not converted. Totals may be inaccurate.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Per-Site P&L Table card ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Site Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Costs</TableHead>
                <TableHead className="text-right">Net Profit</TableHead>
                <TableHead className="text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pnlResult.sitePnL.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No cost or revenue data for the selected period.
                  </TableCell>
                </TableRow>
              ) : (
                pnlResult.sitePnL.map((row) => {
                  const noData = row.revenue === 0 && row.costs === 0;
                  return (
                    <TableRow key={row.site_id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right font-mono">{fmtEUR(row.revenue)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtEUR(row.costs)}</TableCell>
                      <TableCell
                        className={`text-right font-mono ${noData ? "text-muted-foreground" : profitColor(row.profit)}`}
                      >
                        {noData ? "—" : fmtEUR(row.profit)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${roiColor(row.roi)}`}>
                        {row.roi !== null ? `${row.roi.toFixed(1)}%` : "N/A"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {pnlResult.sitePnL.length > 0 && (
            <div className="p-4 border-t flex justify-end">
              <PnLExportButton sitePnL={pnlResult.sitePnL} dateRange={dateRange} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Domain Renewals card (Spaceship-verified, assigned to sites) ──── */}
      <Card>
        <CardHeader>
          <CardTitle>
            Domain Renewals{domainRenewals.length > 0 ? ` (${domainRenewals.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className={domainRenewals.length > 0 ? "p-0" : undefined}>
          {spaceshipError ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Could not fetch domains from Spaceship: {spaceshipError}
            </p>
          ) : domainRenewals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No domains assigned to sites found in Spaceship.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Expiration</TableHead>
                  <TableHead className="text-right">Days Remaining</TableHead>
                  <TableHead className="text-right">Auto-Renew</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domainRenewals.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.domain}</TableCell>
                    <TableCell className="text-muted-foreground">{d.siteName}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {d.expirationDate
                        ? new Date(d.expirationDate).toLocaleDateString("en", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono ${d.daysRemaining !== null ? daysRemainingColor(d.daysRemaining) : "text-muted-foreground"}`}
                    >
                      {d.daysRemaining !== null ? `${d.daysRemaining}d` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.autoRenew ? (
                        <span className="text-green-600 dark:text-green-400 text-sm">Yes</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 text-sm font-medium">
                          No
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Add cost form ───────────────────────────────────────────────────── */}
      <CostForm categories={categories} sites={sites} />

      {/* ── Cost history ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Cost History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No cost entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                costs.map((row) => {
                  const siteName = row.site_id
                    ? (siteNameById.get(row.site_id) ?? "Unknown")
                    : "Portfolio-wide";
                  const categoryName =
                    categories.find((c) => c.slug === row.category_slug)?.name ?? row.category_slug;
                  const formattedAmount = row.amount.toLocaleString("en", {
                    style: "currency",
                    currency: row.currency,
                  });
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-sm">{row.date}</TableCell>
                      <TableCell>{categoryName}</TableCell>
                      <TableCell className="text-muted-foreground">{siteName}</TableCell>
                      <TableCell className="font-medium">{formattedAmount}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.description ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Revenue forms: CSV import + manual entry ────────────────────────── */}
      <RevenueSection sites={sites} />

      {/* ── Revenue history ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenueRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No revenue entries yet. Import an Amazon Associates CSV or add a manual entry.
                  </TableCell>
                </TableRow>
              ) : (
                revenueRows.map((row) => {
                  const formattedAmount = row.amount.toLocaleString("en", {
                    style: "currency",
                    currency: row.currency,
                  });
                  return (
                    <TableRow key={row.key}>
                      <TableCell className="font-mono text-sm">{row.date}</TableCell>
                      <TableCell>{row.source}</TableCell>
                      <TableCell className="text-muted-foreground">{row.siteName}</TableCell>
                      <TableCell className="font-medium">{formattedAmount}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{row.notes}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
