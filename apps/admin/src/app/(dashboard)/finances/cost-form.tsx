'use client'

import { useActionState } from 'react'
import { addCost, type AddCostState } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface CostFormProps {
  categories: { slug: string; name: string }[]
  sites: { id: string; name: string }[]
}

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

export function CostForm({ categories, sites }: CostFormProps) {
  const [state, formAction, isPending] = useActionState<AddCostState, FormData>(addCost, null)

  const errors = state?.errors

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Cost Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {/* Success banner */}
          {state?.success && (
            <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
              Cost entry added.
            </div>
          )}

          {/* Form-level error */}
          {errors?._form && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errors._form[0]}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="category_slug">
                Category <span className="text-destructive">*</span>
              </Label>
              <NativeSelect name="category_slug" defaultValue="">
                <option value="">— Select category —</option>
                {categories.map(({ slug, name }) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </NativeSelect>
              <FieldError messages={errors?.category_slug} />
            </div>

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
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            {/* Currency */}
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <NativeSelect name="currency" defaultValue="EUR">
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
              </NativeSelect>
              <FieldError messages={errors?.currency} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Period */}
            <div className="space-y-1.5">
              <Label htmlFor="period">Period</Label>
              <NativeSelect name="period" defaultValue="">
                <option value="">One-time or N/A</option>
                <option value="one-time">One-time</option>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </NativeSelect>
              <FieldError messages={errors?.period} />
            </div>

            {/* Site */}
            <div className="space-y-1.5">
              <Label htmlFor="site_id">Site</Label>
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
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Notes</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Optional notes about this cost entry"
              rows={2}
              aria-invalid={!!errors?.description}
            />
            <FieldError messages={errors?.description} />
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Adding…' : 'Add Cost Entry'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
