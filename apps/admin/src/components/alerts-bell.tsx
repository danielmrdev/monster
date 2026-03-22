"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { AlertList, type AlertRow } from "@/app/(dashboard)/alerts/AlertList";
import { getOpenAlertsCount, getAlerts } from "@/app/(dashboard)/alerts/actions";
import { createClient } from "@/lib/supabase/client";

/**
 * AlertsBell — header bell icon with open-alert badge and popup modal.
 *
 * Shows two badge types:
 *  - Amber badge: product alerts (open count)
 *  - Blue dot: DFS search completions (via Supabase Realtime)
 */
export function AlertsBell() {
  const [count, setCount] = useState(0);
  const [searchNotifications, setSearchNotifications] = useState(0);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  const fetchData = useCallback(async () => {
    const [newCount, newAlerts] = await Promise.all([getOpenAlertsCount(), getAlerts(["open"])]);
    setCount(newCount);
    setAlerts(newAlerts);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscribe to DFS search completions via Supabase Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("search-notifications")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dfs_search_cache" },
        (payload) => {
          // REPLICA IDENTITY FULL is set, so payload.old is available
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

  // Clear search notifications when bell opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        setSearchNotifications(0);
        fetchData();
      }
    },
    [fetchData],
  );

  const totalBadge = count + searchNotifications;

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
          {searchNotifications > 0 && count === 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500">
              <span className="animate-ping absolute h-3 w-3 rounded-full bg-blue-400 opacity-75" />
            </span>
          )}
          {searchNotifications > 0 && count > 0 && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full bg-blue-500" />
          )}
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Popup className="fixed top-[68px] right-4 z-[60] w-[480px] max-h-[70vh] overflow-auto rounded-lg border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <Dialog.Title className="text-sm font-semibold">Alertas pendientes</Dialog.Title>
              <Dialog.Close
                render={
                  <button
                    className="text-muted-foreground hover:text-foreground text-xs"
                    aria-label="Close alerts panel"
                  >
                    &#10005;
                  </button>
                }
              />
            </div>
            <AlertList alerts={alerts} onActionComplete={handleActionComplete} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
