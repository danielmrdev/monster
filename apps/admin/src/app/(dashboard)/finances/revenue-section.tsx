'use client'

import { useActionState } from 'react'
import {
  importAmazonCSV,
  addManualRevenue,
  type ImportAmazonState,
  type AddManualRevenueState,
} from './actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Shared form helpers
// ---------------------------------------------------------------------------

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return <p className="text-xs text-destructive mt-1">{messages[0]}</p>
}

function NativeSelect({
  name,
  defaultValue,
  children,
}: {
  name: string
  defaultValue?: string
  children: React.ReactNode
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </select>
  )
}

// ---------------------------------------------------------------------------
// CSV Import card
// ---------------------------------------------------------------------------

function CsvImportCard() {
  const [state, formAction, isPending] = useActionState<ImportAmazonState, FormData>(
    importAmazonCSV,
    null
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Amazon Associates CSV</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {/* Success banner */}
          {state?.success === true && (
            <div className="space-y-2">
              <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                {state.result.inserted} imported, {state.result.updated} updated
              </div>
              {state.result.unattributed.length > 0 && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
                  <p className="font-medium mb-1">
                    Unmatched tracking IDs — update <code className="font-mono">affiliate_tag</code>{' '}
                    on the corresponding site:
                  </p>
                  <ul className="space-y-0.5 mt-1">
                    {state.result.unattributed.map((id) => (
                      <li key={id}>
                        <code className="font-mono text-xs">{id}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error banner */}
          {state?.success === false && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Market */}
            <div className="space-y-1.5">
              <Label>
                Amazon Market <span className="text-destructive">*</span>
              </Label>
              <NativeSelect name="market" defaultValue="ES">
                <option value="ES">ES — Spain</option>
                <option value="US">US — United States</option>
                <option value="UK">UK — United Kingdom</option>
                <option value="DE">DE — Germany</option>
                <option value="FR">FR — France</option>
                <option value="IT">IT — Italy</option>
              </NativeSelect>
            </div>

            {/* File */}
            <div className="space-y-1.5">
              <Label htmlFor="csv-file">
                CSV File <span className="text-destructive">*</span>
              </Label>
              <input
                id="csv-file"
                name="file"
                type="file"
                accept=".csv,.txt"
                required
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Importing…' : 'Import CSV'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Manual Revenue Entry card
// ---------------------------------------------------------------------------

interface ManualRevenueCardProps {
  sites: { id: string; name: string }[]
}

function ManualRevenueCard({ sites }: ManualRevenueCardProps) {
  const [state, formAction, isPending] = useActionState<AddManualRevenueState, FormData>(
    addManualRevenue,
    null
  )

  const errors = state?.errors

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Manual Revenue Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {/* Success banner */}
          {state?.success && (
            <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
              Revenue entry added.
            </div>
          )}

          {/* Form-level error */}
          {errors?._form && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errors._form[0]}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Site */}
            <div className="space-y-1.5">
              <Label>Site</Label>
              <NativeSelect name="site_id" defaultValue="">
                <option value="">Portfolio-wide</option>
                {sites.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </NativeSelect>
              <FieldError messages={errors?.site_id} />
            </div>

            {/* Source */}
            <div className="space-y-1.5">
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                name="source"
                type="text"
                placeholder="Amazon Affiliates, AdSense, Sponsorship…"
                aria-invalid={!!errors?.source}
              />
              <FieldError messages={errors?.source} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="amount">
                Amount <span className="text-destructive">*</span>
              </Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                required
                aria-invalid={!!errors?.amount}
              />
              <FieldError messages={errors?.amount} />
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <NativeSelect name="currency" defaultValue="EUR">
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
              </NativeSelect>
              <FieldError messages={errors?.currency} />
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="date">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                aria-invalid={!!errors?.date}
              />
              <FieldError messages={errors?.date} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Optional notes about this revenue entry"
              rows={2}
              aria-invalid={!!errors?.notes}
            />
            <FieldError messages={errors?.notes} />
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Adding…' : 'Add Revenue Entry'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// RevenueSection — exported composite
// ---------------------------------------------------------------------------

interface RevenueSectionProps {
  sites: { id: string; name: string }[]
}

export function RevenueSection({ sites }: RevenueSectionProps) {
  return (
    <div className="space-y-6">
      <CsvImportCard />
      <ManualRevenueCard sites={sites} />
    </div>
  )
}
