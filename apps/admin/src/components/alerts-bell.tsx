"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, CheckCircle2, XCircle } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { AlertList, type AlertRow } from "@/app/(dashboard)/alerts/AlertList";
import { getOpenAlertsCount, getAlerts } from "@/app/(dashboard)/alerts/actions";
import { createClient } from "@/lib/supabase/client";
import { type JobNotification, jobLabel } from "@/hooks/useJobNotifications";

interface AlertsBellProps {
  /** Finished jobs from useJobNotifications (completed/failed since page load). */
  finishedJobs?: JobNotification[];
  /** Called when the bell opens to clear the finished jobs badge. */
  onClearFinishedJobs?: () => void;
}

/**
 * AlertsBell — header bell icon with open-alert badge and popup modal.
 *
 * Badge types:
 *  - Amber badge: product alerts (open count)
 *  - Blue dot: DFS search completions (via Supabase Realtime)
 *  - Green dot: job completions (via useJobNotifications)
 */
export function AlertsBell({ finishedJobs = [], onClearFinishedJobs }: AlertsBellProps) {
  const [count, setCount] = useState(0);
  const [searchNotifications, setSearchNotifications] = useState(0);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [siteNames, setSiteNames] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    const [newCount, newAlerts] = await Promise.all([getOpenAlertsCount(), getAlerts(["open"])]);
    setCount(newCount);
    setAlerts(newAlerts);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Resolve site names for finished jobs
  useEffect(() => {
    const unknownSiteIds = finishedJobs
      .map((j) => j.site_id)
      .filter((id): id is string => id !== null && !(id in siteNames));

    if (unknownSiteIds.length === 0) return;

    const unique = [...new Set(unknownSiteIds)];
    const supabase = createClient();
    supabase
      .from("sites")
      .select("id, name")
      .in("id", unique)
      .then(({ data }) => {
        if (data) {
          setSiteNames((prev) => {
            const next = { ...prev };
            for (const site of data) {
              next[site.id] = site.name;
            }
            return next;
          });
        }
      });
  }, [finishedJobs, siteNames]);

  // Subscribe to DFS search completions via Supabase Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("search-notifications")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dfs_search_cache" },
        (payload) => {
          if (payload.new.status === "complete" && payload.old?.status === "pending") {
            setSearchNotifications((prev) => prev + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleActionComplete = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        setSearchNotifications(0);
        onClearFinishedJobs?.();
        fetchData();
      }
    },
    [fetchData, onClearFinishedJobs],
  );

  const jobNotificationCount = finishedJobs.length;
  const hasNotifications = searchNotifications > 0 || jobNotificationCount > 0;
  const totalBadge = count + (hasNotifications ? 1 : 0);

  return (
    <div className="relative" data-alerts-bell>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Trigger
          className="relative rounded-md p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          aria-label={totalBadge > 0 ? `${totalBadge} notifications` : "Alerts"}
        >
          <Bell size={16} strokeWidth={1.75} />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white leading-none">
              {count > 99 ? "99+" : count}
            </span>
          )}
          {hasNotifications && count === 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500">
              <span className="animate-ping absolute h-3 w-3 rounded-full bg-emerald-400 opacity-75" />
            </span>
          )}
          {hasNotifications && count > 0 && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          )}
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Popup className="fixed top-[68px] right-4 z-[60] w-[480px] max-h-[70vh] overflow-auto rounded-lg border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <Dialog.Title className="text-sm font-semibold">Notificaciones</Dialog.Title>
              <Dialog.Close
                render={
                  <button
                    className="text-muted-foreground hover:text-foreground text-xs"
                    aria-label="Close notifications panel"
                  >
                    &#10005;
                  </button>
                }
              />
            </div>

            {/* Finished jobs section */}
            {finishedJobs.length > 0 && (
              <div className="border-b border-border">
                <div className="px-4 py-2 bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Jobs completados
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {finishedJobs.map((job) => (
                    <div key={job.id} className="flex items-start gap-3 px-4 py-3">
                      {job.status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {jobLabel(job.job_type)}{" "}
                          <span
                            className={
                              job.status === "completed" ? "text-emerald-500" : "text-red-500"
                            }
                          >
                            {job.status === "completed" ? "completado" : "falló"}
                          </span>
                        </p>
                        {job.site_id && siteNames[job.site_id] && (
                          <p className="text-xs text-muted-foreground">{siteNames[job.site_id]}</p>
                        )}
                        {job.status === "failed" && job.error && (
                          <p className="text-xs text-red-400 mt-0.5 line-clamp-2">{job.error}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 mt-0.5">
                        {new Date(job.completed_at).toLocaleTimeString("es", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Product alerts section */}
            {(alerts.length > 0 || finishedJobs.length === 0) && (
              <>
                {finishedJobs.length > 0 && (
                  <div className="px-4 py-2 bg-muted/30">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Alertas de producto
                    </span>
                  </div>
                )}
                <AlertList alerts={alerts} onActionComplete={handleActionComplete} />
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
