"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Circle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobRow {
  id: string;
  job_type: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  payload: Record<string, unknown> | null;
  bull_job_id: string | null;
  sites: { name: string; id: string } | null;
}

interface Props {
  initialJobs: JobRow[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ["all", "pending", "active", "completed", "failed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const JOB_TYPE_LABELS: Record<string, string> = {
  seo_product: "SEO Product",
  seo_products_batch: "SEO Batch",
  seo_category: "SEO Category",
  generate_site: "Generate Site",
  deploy_site: "Deploy Site",
  niche_research: "Niche Research",
  product_refresh: "Product Refresh",
  analytics_aggregation: "Analytics Agg.",
};

const AUTO_REFRESH_MS = 8_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function getDuration(job: JobRow): string | null {
  const start = job.started_at ?? job.created_at;
  const end = job.completed_at ?? (job.status === "active" ? new Date().toISOString() : null);
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return null;
  return formatDuration(ms);
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return formatTime(iso);
  return (
    d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }) + " " + formatTime(iso)
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          completed
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
          <XCircle className="w-3.5 h-3.5" />
          failed
        </span>
      );
    case "active":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          active
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          pending
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Circle className="w-3.5 h-3.5" />
          {status}
        </span>
      );
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function JobsTable({ initialJobs }: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[]>(initialJobs);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, startRefresh] = useTransition();

  // Counts per status for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const j of jobs) {
      counts[j.status] = (counts[j.status] ?? 0) + 1;
    }
    return counts;
  }, [jobs]);

  // All distinct job types in current data
  const jobTypes = useMemo(() => {
    const types = new Set(jobs.map((j) => j.job_type));
    return Array.from(types).sort();
  }, [jobs]);

  // Filtered rows
  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (typeFilter !== "all" && j.job_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const siteName = j.sites?.name?.toLowerCase() ?? "";
        const type = j.job_type.toLowerCase();
        const jobId = j.id.toLowerCase();
        if (!siteName.includes(q) && !type.includes(q) && !jobId.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, statusFilter, typeFilter, search]);

  // Stats
  const stats = useMemo(() => {
    const completed = jobs.filter((j) => j.status === "completed");
    const durations = completed
      .map((j) => {
        const start = j.started_at ?? j.created_at;
        if (!start || !j.completed_at) return null;
        return new Date(j.completed_at).getTime() - new Date(start).getTime();
      })
      .filter((d): d is number => d !== null && d > 0);
    const avg = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    return {
      total: jobs.length,
      pending: statusCounts["pending"] ?? 0,
      active: statusCounts["active"] ?? 0,
      failed: statusCounts["failed"] ?? 0,
      avgDuration: avg,
    };
  }, [jobs, statusCounts]);

  // Refresh function
  function refresh() {
    startRefresh(() => {
      router.refresh();
      setLastRefresh(new Date());
    });
  }

  // Auto-refresh while there are active/pending jobs
  useEffect(() => {
    if (!autoRefresh) return;
    const hasLiveJobs = jobs.some((j) => j.status === "active" || j.status === "pending");
    if (!hasLiveJobs) return;
    const timer = setInterval(refresh, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, jobs]);

  // Sync when router.refresh() delivers new server data
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">
            BullMQ worker queue — last {jobs.length} jobs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
              autoRefresh
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Auto {autoRefresh ? "ON" : "OFF"}
          </button>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Pending", value: stats.pending, color: "text-muted-foreground" },
          {
            label: "Active",
            value: stats.active,
            color: stats.active > 0 ? "text-blue-400" : "text-muted-foreground",
          },
          {
            label: "Failed",
            value: stats.failed,
            color: stats.failed > 0 ? "text-destructive" : "text-muted-foreground",
          },
          {
            label: "Avg duration",
            value: stats.avgDuration != null ? formatDuration(stats.avgDuration) : "—",
            color: "text-muted-foreground",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-card px-3 py-2.5 flex flex-col gap-0.5"
          >
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className={`text-lg font-semibold tabular-nums leading-tight ${color}`}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status filter */}
        <div className="flex items-center gap-1 border border-border rounded-lg p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? `All (${jobs.length})` : `${s} (${statusCounts[s] ?? 0})`}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All types</option>
          {jobTypes.map((t) => (
            <option key={t} value={t}>
              {JOB_TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>

        {/* Search */}
        <Input
          placeholder="Search site, type, job ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 h-9 text-xs"
        />

        {/* Last refresh */}
        <span className="text-xs text-muted-foreground/50 ml-auto">
          Updated {formatTime(lastRefresh.toISOString())}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="text-xs w-[130px]">Type</TableHead>
              <TableHead className="text-xs">Site</TableHead>
              <TableHead className="text-xs w-[110px]">Status</TableHead>
              <TableHead className="text-xs w-[130px]">Created</TableHead>
              <TableHead className="text-xs w-[130px]">Started</TableHead>
              <TableHead className="text-xs w-[130px]">Completed</TableHead>
              <TableHead className="text-xs w-[80px] text-right">Duration</TableHead>
              <TableHead className="text-xs">Error / Info</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                  No jobs match the current filter.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((job) => {
              const duration = getDuration(job);
              const isLive = job.status === "active";
              return (
                <TableRow key={job.id} className={`text-xs ${isLive ? "bg-blue-950/20" : ""}`}>
                  <TableCell className="font-medium text-foreground">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {JOB_TYPE_LABELS[job.job_type] ?? job.job_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.sites ? (
                      <a
                        href={`/sites/${job.sites.id}`}
                        className="hover:text-foreground transition-colors underline underline-offset-2 decoration-muted-foreground/30"
                      >
                        {job.sites.name}
                      </a>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDate(job.created_at)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDate(job.started_at)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDate(job.completed_at)}
                  </TableCell>
                  <TableCell className="tabular-nums text-right text-muted-foreground">
                    {duration ?? (isLive ? <span className="text-blue-400">live…</span> : "—")}
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    {job.error ? (
                      <span
                        className="text-destructive/80 line-clamp-2 cursor-help"
                        title={job.error}
                      >
                        {job.error}
                      </span>
                    ) : job.status === "active" ? (
                      <span className="text-blue-400/60 text-[10px]">processing…</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filtered.length !== jobs.length && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {jobs.length} jobs
        </p>
      )}
    </div>
  );
}
