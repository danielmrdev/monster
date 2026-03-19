import { useEffect, useRef, useCallback } from "react";

interface UseJobPollerOptions<T> {
  /** Async function that returns the current job row (or null). */
  fetchFn: () => Promise<T | null>;
  /** Called when the job transitions to 'completed'. */
  onComplete?: (job: T) => void;
  /** Called when the job transitions to 'failed'. */
  onFail?: (job: T) => void;
  /**
   * Called on mount with the most recent job row (or null).
   * Use this to restore UI state after navigation.
   * - If the job is pending/running → return true to resume polling.
   * - If completed/failed → restore state and return false (no polling needed).
   * - If null → nothing to resume, return false.
   */
  onResume?: (job: T | null) => boolean;
  /** Poll interval in ms while pending/running. Default: 2000. */
  intervalMs?: number;
  /** Whether polling is currently active. Set to false to pause. */
  enabled: boolean;
}

type WithStatus = { status: string; completed_at?: string | null };

/**
 * Shared polling hook for BullMQ job rows.
 *
 * - Polls every `intervalMs` (default 2s) while `enabled` is true.
 * - Calls `onComplete` / `onFail` exactly once when the terminal state is first detected.
 * - Stops polling automatically after a terminal state (completed/failed).
 * - Cleans up the interval on unmount.
 * - On mount, calls `onResume` (if provided) to restore state after navigation.
 */
export function useJobPoller<T extends WithStatus>({
  fetchFn,
  onComplete,
  onFail,
  onResume,
  intervalMs = 2000,
  enabled,
}: UseJobPollerOptions<T>) {
  const onCompleteRef = useRef(onComplete);
  const onFailRef = useRef(onFail);
  const onResumeRef = useRef(onResume);
  const fetchRef = useRef(fetchFn);
  const terminatedRef = useRef(false);
  const resumedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);
  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);
  useEffect(() => {
    fetchRef.current = fetchFn;
  }, [fetchFn]);

  const tick = useCallback(async () => {
    if (terminatedRef.current) return;
    try {
      const job = await fetchRef.current();
      if (!job) return;
      if (job.status === "completed") {
        terminatedRef.current = true;
        onCompleteRef.current?.(job);
      } else if (job.status === "failed") {
        terminatedRef.current = true;
        onFailRef.current?.(job);
      }
    } catch {
      // network error — keep polling
    }
  }, []);

  // Resume on mount: fetch latest job and restore state
  useEffect(() => {
    if (resumedRef.current || !onResumeRef.current) return;
    resumedRef.current = true;
    void (async () => {
      try {
        const job = await fetchRef.current();
        onResumeRef.current?.(job);
      } catch {
        // ignore — resume is best-effort
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled) return;
    terminatedRef.current = false;
    // Immediate first tick
    void tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, tick]);
}
