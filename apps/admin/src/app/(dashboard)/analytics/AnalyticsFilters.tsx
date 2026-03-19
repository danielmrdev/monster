"use client";

interface AnalyticsFiltersProps {
  sites: Array<{ id: string; name: string }>;
  selectedSite: string | undefined;
  selectedRange: string;
}

export function AnalyticsFilters({ sites, selectedSite, selectedRange }: AnalyticsFiltersProps) {
  return (
    <form method="GET" className="flex gap-3 items-end flex-wrap">
      {/* Site selector */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="site" className="text-sm font-medium">
          Site
        </label>
        <select
          id="site"
          name="site"
          defaultValue={selectedSite ?? ""}
          onChange={(e) => e.currentTarget.form?.submit()}
          className="h-8 min-w-[180px] rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">All Sites</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date range selector */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="range" className="text-sm font-medium">
          Date Range
        </label>
        <select
          id="range"
          name="range"
          defaultValue={selectedRange}
          onChange={(e) => e.currentTarget.form?.submit()}
          className="h-8 min-w-[140px] rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      {/* Fallback submit button (for keyboard/no-JS users) */}
      <button
        type="submit"
        className="h-8 rounded-lg border border-input bg-transparent px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Apply
      </button>
    </form>
  );
}
