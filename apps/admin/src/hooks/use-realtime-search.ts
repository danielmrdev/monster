"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase Realtime for dfs_search_cache updates.
 * Calls `onComplete` when a row matching `keyword`+`market` transitions to status=complete.
 */
export function useRealtimeSearch(keyword: string | null, market: string, onComplete: () => void) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!keyword) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`dfs-search-${keyword}-${market}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dfs_search_cache",
          filter: `keyword=eq.${keyword.toLowerCase()}`,
        },
        (payload) => {
          if (payload.new.status === "complete" && payload.new.market === market) {
            onCompleteRef.current();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [keyword, market]);
}
