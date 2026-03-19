"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rescoreSite } from "./seo/rescore-actions";

interface RescoreSiteButtonProps {
  siteId: string;
}

/**
 * Button that triggers a full SEO rescore from the existing dist/ without regenerating.
 * Shows inline feedback: scored N pages, or an error message.
 */
export function RescoreSiteButton({ siteId }: RescoreSiteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  function handleRescore() {
    setStatus(null);
    startTransition(async () => {
      const result = await rescoreSite(siteId);
      if (result.error) {
        setStatus({ ok: false, message: result.error });
      } else {
        setStatus({ ok: true, message: `Rescored ${result.scored} pages` });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {status && (
        <p className={`text-xs ${status.ok ? "text-green-400" : "text-red-400"}`}>
          {status.message}
        </p>
      )}
      <button
        type="button"
        onClick={handleRescore}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending && (
          <svg
            className="h-3.5 w-3.5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {isPending ? "Rescoring…" : "Recalculate Scores"}
      </button>
    </div>
  );
}
