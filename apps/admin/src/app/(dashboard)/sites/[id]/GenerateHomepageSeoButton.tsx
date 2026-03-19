'use client';

import { useTransition, useState } from 'react';
import { enqueueHomepageSeo } from './seo/actions';

interface GenerateHomepageSeoButtonProps {
  siteId: string;
}

/**
 * Client component wrapping "Generate Homepage SEO" server action.
 *
 * Uses useTransition to show a loading state immediately on click
 * while the server action enqueues the BullMQ job. Once the action
 * resolves, the ai_jobs row is visible in Supabase and the worker
 * will pick it up to generate homepage SEO text.
 */
export function GenerateHomepageSeoButton({ siteId }: GenerateHomepageSeoButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await enqueueHomepageSeo(siteId);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1 pt-4">
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
            Generating…
          </>
        ) : (
          'Generate Homepage SEO'
        )}
      </button>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
