'use client';

import { useTransition, useState } from 'react';
import { enqueueProductSeo } from '../../seo/actions';

interface GenerateProductSeoButtonProps {
  siteId: string;
  productId: string;
  categoryId: string;
}

/**
 * Client component wrapping "Generate Product SEO" server action.
 *
 * Uses useTransition to show a loading state immediately on click
 * while the server action enqueues a seo_product BullMQ job.
 * Once the action resolves, the ai_jobs row is visible in Supabase
 * and the worker will pick it up to generate detailed_description,
 * pros_cons, user_opinions_summary, meta_description, and focus_keyword
 * for the product.
 *
 * Observability: on click, an ai_jobs row with job_type='seo_product'
 * and status='pending' appears immediately in Supabase. Failure surface:
 * ai_jobs.status='failed' + ai_jobs.error column. Any enqueue-level error
 * is surfaced inline below this button via the error state.
 */
export function GenerateProductSeoButton({ siteId, productId, categoryId }: GenerateProductSeoButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await enqueueProductSeo(siteId, productId, categoryId);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
          'Generate SEO'
        )}
      </button>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
