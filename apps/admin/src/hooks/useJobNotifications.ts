"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const JOB_TYPE_LABELS: Record<string, string> = {
  seo_product: "SEO Product",
  seo_products_batch: "SEO Batch",
  seo_category: "SEO Category",
  seo_homepage: "SEO Homepage",
  generate_site: "Generate Site",
  deploy_site: "Deploy Site",
  niche_research: "Niche Research",
  product_refresh: "Product Refresh",
  analytics_aggregation: "Analytics Agg.",
};

export function jobLabel(jobType: string): string {
  return JOB_TYPE_LABELS[jobType] ?? jobType;
}

export interface JobNotification {
  id: string;
  job_type: string;
  status: "completed" | "failed";
  error: string | null;
  site_id: string | null;
  completed_at: string;
}

interface JobNotificationsState {
  /** Number of jobs currently pending or running. */
  activeCount: number;
  /** Jobs that finished (completed/failed) since the page loaded. */
  finishedJobs: JobNotification[];
  /** Clear the finished jobs list (e.g. when the bell modal opens). */
  clearFinishedJobs: () => void;
}

/**
 * Subscribes to Supabase Realtime on `ai_jobs` to:
 * 1. Track the count of pending/running jobs (for sidebar badge).
 * 2. Collect finished jobs (for the alerts bell notification).
 *
 * Requires REPLICA IDENTITY FULL on ai_jobs (migration 20260323000000).
 */
export function useJobNotifications(): JobNotificationsState {
  const [activeCount, setActiveCount] = useState(0);
  const [finishedJobs, setFinishedJobs] = useState<JobNotification[]>([]);
  const mountedRef = useRef(true);

  const clearFinishedJobs = useCallback(() => {
    setFinishedJobs([]);
  }, []);

  // Fetch initial active count
  const fetchActiveCount = useCallback(async () => {
    try {
      const supabase = createClient();
      const { count } = await supabase
        .from("ai_jobs")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "running"]);
      if (mountedRef.current) {
        setActiveCount(count ?? 0);
      }
    } catch {
      // ignore — best effort
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchActiveCount();

    const supabase = createClient();

    const channel = supabase
      .channel("job-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_jobs" }, () => {
        if (mountedRef.current) {
          setActiveCount((prev) => prev + 1);
        }
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ai_jobs" },
        (payload) => {
          const oldStatus = payload.old?.status;
          const newStatus = payload.new.status;

          if (oldStatus !== newStatus && (newStatus === "completed" || newStatus === "failed")) {
            if (mountedRef.current) {
              setActiveCount((prev) => Math.max(0, prev - 1));
              setFinishedJobs((prev) => [
                {
                  id: payload.new.id as string,
                  job_type: payload.new.job_type as string,
                  status: newStatus,
                  error: (payload.new.error as string) ?? null,
                  site_id: payload.new.site_id as string | null,
                  completed_at: (payload.new.completed_at as string) ?? new Date().toISOString(),
                },
                ...prev,
              ]);
            }
          }
        },
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [fetchActiveCount]);

  return { activeCount, finishedJobs, clearFinishedJobs };
}
