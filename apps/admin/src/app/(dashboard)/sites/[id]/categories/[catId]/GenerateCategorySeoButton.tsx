"use client";

/**
 * Client component wrapping "Generate Category SEO" server action.
 *
 * Passes currentContent and currentScore to the worker so it can:
 * - Reuse the existing focus_keyword for consistency
 * - Show the existing content as reference in the prompt
 * - Set a score floor (output must beat currentScore)
 */

import { useTransition, useState } from "react";
import { enqueueCategorySeo } from "../../seo/actions";

interface GenerateCategorySeoButtonProps {
  siteId: string;
  categoryId: string;
  currentContent?: {
    focus_keyword?: string | null;
    seo_text?: string | null;
    description?: string | null;
  };
  currentScore?: number | null;
}
export function GenerateCategorySeoButton({
  siteId,
  categoryId,
  currentContent,
  currentScore,
}: GenerateCategorySeoButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await enqueueCategorySeo(siteId, categoryId, {
        currentContent,
        currentScore,
      });
      if (result.error) {
        setError(result.error);
      }
    });
  }

  const hasExistingContent = currentContent?.seo_text || currentContent?.description;

  return (
    <div className="flex flex-col items-start gap-1">
      {currentScore != null && (
        <p className="text-xs text-muted-foreground">
          Current quality: <span className="font-mono">{currentScore}/100</span>
          {currentScore < 70
            ? " — AI will try to improve"
            : currentScore >= 80
              ? " — good"
              : " — acceptable"}
        </p>
      )}
      {hasExistingContent && currentContent?.description && (
        <p className="text-xs text-muted-foreground truncate max-w-xs">
          <span className="font-medium text-foreground/60">Desc: </span>
          {currentContent.description}
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <svg
              className="animate-spin h-3.5 w-3.5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
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
            Queuing…
          </>
        ) : (
          `✦ ${hasExistingContent ? "Regenerate" : "Generate"} Category SEO`
        )}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
