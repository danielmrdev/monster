'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertList, type AlertRow } from '@/app/(dashboard)/alerts/AlertList';
import { getOpenAlertsCount, getAlerts } from '@/app/(dashboard)/alerts/actions';

/**
 * AlertsBell — header bell icon with open-alert badge and popup modal.
 *
 * Renders a Bell icon in the header. When there are open product alerts,
 * shows an amber badge with the count. Clicking opens a @base-ui/react/dialog
 * popup anchored below the header with the AlertList component.
 *
 * Observability:
 *  - data-alerts-bell attribute for DevTools inspection
 *  - Badge span is only present in DOM when count > 0
 *  - aria-label shows count: "${count} open alerts" or "Alerts" when 0
 *  - count fetch failure: logs "[alerts] getOpenAlertsCount failed:" to server console; badge stays at 0
 *  - alert fetch failure: logs "[alerts] getAlerts failed:" to server console; modal shows empty state
 */
export function AlertsBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  const fetchData = useCallback(async () => {
    const [newCount, newAlerts] = await Promise.all([
      getOpenAlertsCount(),
      getAlerts(['open']),
    ]);
    setCount(newCount);
    setAlerts(newAlerts);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleActionComplete = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="relative" data-alerts-bell>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          className="relative rounded-md p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          aria-label={count > 0 ? `${count} open alerts` : 'Alerts'}
        >
          <Bell size={16} strokeWidth={1.75} />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white leading-none">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Popup className="fixed top-14 right-4 z-[60] w-[480px] max-h-[70vh] overflow-auto rounded-lg border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <Dialog.Title className="text-sm font-semibold">
                Alertas pendientes
              </Dialog.Title>
              <Dialog.Close
                render={<button className="text-muted-foreground hover:text-foreground text-xs" aria-label="Close alerts panel">✕</button>}
              />
            </div>
            <AlertList alerts={alerts} onActionComplete={handleActionComplete} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
