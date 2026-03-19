"use client";

import { useActionState } from "react";
import { enqueueResearch, type EnqueueResearchState } from "./actions";
import { MARKET_OPTIONS } from "./constants";
import { Button } from "@/components/ui/button";

const initialState: EnqueueResearchState = null;

export default function ResearchForm() {
  const [state, formAction, isPending] = useActionState<EnqueueResearchState, FormData>(
    enqueueResearch,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="nicheIdea" className="text-sm font-medium text-foreground/80">
          Niche idea
        </label>
        <input
          id="nicheIdea"
          name="nicheIdea"
          type="text"
          required
          minLength={3}
          placeholder="e.g. freidoras de aire, robot aspirador…"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isPending}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="market" className="text-sm font-medium text-foreground/80">
          Market
        </label>
        <select
          id="market"
          name="market"
          defaultValue="ES"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isPending}
        >
          {MARKET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{state.error}</p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Starting research…" : "Start Research"}
      </Button>
    </form>
  );
}
