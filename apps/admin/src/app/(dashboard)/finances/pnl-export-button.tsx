'use client'

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import type { SitePnL } from './lib'

interface PnLExportButtonProps {
  sitePnL: SitePnL[]
  dateRange: { from: string; to: string }
}

export function PnLExportButton({ sitePnL, dateRange }: PnLExportButtonProps) {
  function handleExport() {
    const header = 'Site,Revenue (EUR),Costs (EUR),Net Profit (EUR),ROI %'
    const rows = sitePnL.map((row) => {
      const roi = row.roi !== null ? row.roi.toFixed(2) : 'N/A'
      // Escape any site names that contain commas or quotes
      const siteName = row.name.includes(',') || row.name.includes('"')
        ? `"${row.name.replace(/"/g, '""')}"`
        : row.name
      return `${siteName},${row.revenue.toFixed(2)},${row.costs.toFixed(2)},${row.profit.toFixed(2)},${roi}`
    })

    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `pnl-${dateRange.from}-${dateRange.to}.csv`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export P&L CSV
    </Button>
  )
}
