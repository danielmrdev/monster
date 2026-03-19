"use client" /* Header */ /* Field checkboxes */ /* Current content preview (collapsed hints) */ /* Action */ // all = no restriction in payload

import { useTransition, useState } from "react"
import { enqueueHomepageSeo } from "./seo/actions"

type HomepageField = "meta_description" | "intro" | "seo_text"

interface GenerateHomepageSeoButtonProps {
  siteId: string
  currentContent?: {
    focus_keyword?: string | null
    meta_description?: string | null
    intro?: string | null
    seo_text?: string | null
  }
  currentScore?: number | null
}

const FIELD_LABELS: Record<HomepageField, string> = {
  meta_description: "Meta Description",
  intro: "Intro",
  seo_text: "SEO Text",
}

const ALL_FIELDS: HomepageField[] = ["meta_description", "intro", "seo_text"]

export function GenerateHomepageSeoButton({
  siteId,
  currentContent,
  currentScore,
}: GenerateHomepageSeoButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<HomepageField>>(
    new Set(ALL_FIELDS),
  )

  function toggle(field: HomepageField) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  function handleClick() {
    if (
      selected.size ===
      0
    )
      return
    setError(null)
    startTransition(async () => {
      const fields = ALL_FIELDS.every((f) => selected.has(f))
        ? undefined
        : ALL_FIELDS.filter((f) => selected.has(f))

      const result = await enqueueHomepageSeo(siteId, {
        fields,
        currentContent,
        currentScore,
      })
      if (result.error) {
        setError(result.error)
      }
    })
  }

  const hasAny = selected.size > 0

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      {}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            Generate with AI
          </p>
          {currentScore != null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Current content quality:{" "}
              <span className="font-mono">{currentScore}/100</span>
              {currentScore < 70
                ? " — AI will try to improve"
                : currentScore >= 80
                  ? " — good"
                  : " — acceptable"}
            </p>
          )}
        </div>
      </div>

      {}
      <div className="flex flex-wrap gap-2">
        {ALL_FIELDS.map((field) => (
          <button
            key={field}
            type="button"
            onClick={() => toggle(field)}
            className={[
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors",
              selected.has(field)
                ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                : "border-border bg-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <span className={selected.has(field) ? "opacity-100" : "opacity-0"}>
              ✓
            </span>
            {FIELD_LABELS[field]}
          </button>
        ))}
      </div>

      {}
      {currentContent && (
        <div className="space-y-1 text-xs text-muted-foreground border-t border-border pt-2">
          {currentContent.meta_description && (
            <p className="truncate">
              <span className="font-medium text-foreground/60">Meta: </span>
              {currentContent.meta_description}
            </p>
          )}
          {currentContent.intro && (
            <p className="truncate">
              <span className="font-medium text-foreground/60">Intro: </span>
              {currentContent.intro}
            </p>
          )}
        </div>
      )}

      {}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending || !hasAny}
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
            `✦ Generate ${
              selected.size === ALL_FIELDS.length
                ? "All"
                : selected.size === 1
                  ? FIELD_LABELS[[...selected][0]]
                  : `${selected.size} fields`
            }`
          )}
        </button>
        {!hasAny && (
          <p className="text-xs text-muted-foreground">
            Select at least one field
          </p>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
