'use client'

interface FinancesFiltersProps {
  defaultFrom: string
  defaultTo: string
}

export function FinancesFilters({ defaultFrom, defaultTo }: FinancesFiltersProps) {
  return (
    <form method="GET" className="flex gap-3 items-end flex-wrap">
      {/* From date */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="from" className="text-sm font-medium">
          From
        </label>
        <input
          id="from"
          type="date"
          name="from"
          defaultValue={defaultFrom}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>

      {/* To date */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="to" className="text-sm font-medium">
          To
        </label>
        <input
          id="to"
          type="date"
          name="to"
          defaultValue={defaultTo}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="h-8 rounded-lg border border-input bg-transparent px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Apply
      </button>
    </form>
  )
}
