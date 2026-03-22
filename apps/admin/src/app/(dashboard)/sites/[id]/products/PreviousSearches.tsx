"use client";

import { formatDistanceToNow } from "date-fns";

export interface CachedSearch {
  keyword: string;
  market: string;
  depth: number;
  result_count: number;
  status: string;
  created_at: string;
}

interface Props {
  searches: CachedSearch[];
  onSelect: (keyword: string) => void;
}

export function PreviousSearches({ searches, onSelect }: Props) {
  if (searches.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Previous searches
      </h3>
      <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
        {searches.map((s) => (
          <button
            key={`${s.keyword}-${s.market}`}
            type="button"
            onClick={() => s.status === "complete" && onSelect(s.keyword)}
            disabled={s.status === "pending"}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/10 transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-foreground truncate">{s.keyword}</span>
              {s.status === "pending" && (
                <span className="shrink-0 text-[10px] font-medium text-amber-400 border border-amber-400/40 px-1.5 py-0.5 rounded animate-pulse">
                  searching...
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              {s.status === "complete" && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {s.result_count} results
                </span>
              )}
              <span className="text-xs text-muted-foreground/60">
                {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
