'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { formatCurrency, formatMonth } from '@/lib/calculations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface FixedCostRow {
  id: string
  cost_category: string
  cost_subcategory: string
  target_month: string
  amount: number
}

interface PersonnelPaymentRow {
  id: string
  target_month: string
  amount: number
}

interface CampaignCostRow {
  id: string
  campaign_id: number
  cost_type: string
  cost_label: string
  amount: number
  target_month: string | null
}

interface CampaignRef {
  id: number
  maker: string
  product: string
}

interface CostBreakdownProps {
  fixedCosts: FixedCostRow[]
  personnelPayments: PersonnelPaymentRow[]
  campaignCosts: CampaignCostRow[]
  campaigns: CampaignRef[]
}

const MONTHS = [
  '2025-11-01', '2025-12-01',
  '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01',
  '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01',
  '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01',
]

function sumAcrossMonths(getter: (month: string) => number): number {
  return MONTHS.reduce((sum, m) => sum + getter(m), 0)
}

export function CostBreakdown({ fixedCosts, personnelPayments, campaignCosts, campaigns }: CostBreakdownProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    eGuardian: true,
    personnel: true,
    projectCost: true,
  })

  const toggle = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

  // --- E-Guardian data ---
  const egSubcategories = useMemo(() => {
    const subs = new Set(fixedCosts.filter(c => c.cost_category === 'e_guardian').map(c => c.cost_subcategory))
    return Array.from(subs)
  }, [fixedCosts])

  const getEgAmount = (sub: string, month: string) =>
    fixedCosts.filter(c => c.cost_category === 'e_guardian' && c.cost_subcategory === sub && c.target_month === month)
      .reduce((s, c) => s + Number(c.amount), 0)
  const getEgSubtotal = (month: string) =>
    fixedCosts.filter(c => c.cost_category === 'e_guardian' && c.target_month === month)
      .reduce((s, c) => s + Number(c.amount), 0)

  // --- Personnel data ---
  const getPersonnelAmount = (month: string) =>
    personnelPayments.filter(p => p.target_month === month).reduce((s, p) => s + Number(p.amount), 0)

  // --- Campaign costs data ---
  const projectCostEntries = useMemo(() => Object.values(
    campaignCosts.reduce<Record<string, { campaignId: number; displayName: string; costLabel: string; byMonth: Record<string, number> }>>((acc, cost) => {
      const campaign = campaigns.find(c => c.id === cost.campaign_id)
      const displayName = campaign ? `${campaign.maker} ${campaign.product}` : ''
      const key = `${cost.campaign_id}::${cost.cost_label}`
      if (!acc[key]) acc[key] = { campaignId: cost.campaign_id, displayName, costLabel: cost.cost_label, byMonth: {} }
      if (cost.target_month) acc[key].byMonth[cost.target_month] = (acc[key].byMonth[cost.target_month] || 0) + Number(cost.amount)
      return acc
    }, {})
  ), [campaignCosts, campaigns])

  const getProjectCostSubtotal = (month: string) =>
    campaignCosts.filter(c => c.target_month === month).reduce((s, c) => s + Number(c.amount), 0)

  // Grand total
  const getGrandTotal = (month: string) => getEgSubtotal(month) + getPersonnelAmount(month) + getProjectCostSubtotal(month)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">月次コスト内訳</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-white min-w-[220px]">項目</TableHead>
              {MONTHS.map(m => (
                <TableHead key={m} className="text-right min-w-[100px] text-xs">{formatMonth(m)}</TableHead>
              ))}
              <TableHead className="text-right min-w-[110px] font-bold bg-blue-50 text-xs">合計</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* イー・ガーディアン */}
            <SectionHeaderRow
              label="イー・ガーディアン"
              open={openSections.eGuardian}
              onToggle={() => toggle('eGuardian')}
              getSubtotal={getEgSubtotal}
            />
            {openSections.eGuardian && (
              <>
                {egSubcategories.map(sub => (
                  <MonthlyDetailRow key={sub} label={sub} getAmount={m => getEgAmount(sub, m)} />
                ))}
                <SubtotalRow getSubtotal={getEgSubtotal} />
              </>
            )}

            {/* 人件費 */}
            <SectionHeaderRow
              label="人件費"
              open={openSections.personnel}
              onToggle={() => toggle('personnel')}
              getSubtotal={getPersonnelAmount}
            />
            {openSections.personnel && (
              <>
                <MonthlyDetailRow label="合計" getAmount={getPersonnelAmount} />
                <SubtotalRow getSubtotal={getPersonnelAmount} />
              </>
            )}

            {/* 案件コスト（原価） */}
            <SectionHeaderRow
              label="案件コスト（原価）"
              open={openSections.projectCost}
              onToggle={() => toggle('projectCost')}
              getSubtotal={getProjectCostSubtotal}
            />
            {openSections.projectCost && (
              <>
                {projectCostEntries.map(entry => (
                  <MonthlyDetailRow
                    key={`${entry.campaignId}-${entry.costLabel}`}
                    label={`${entry.displayName} ${entry.costLabel}`}
                    getAmount={m => entry.byMonth[m] || 0}
                    linkHref={`/campaigns/${entry.campaignId}`}
                  />
                ))}
                <SubtotalRow getSubtotal={getProjectCostSubtotal} />
              </>
            )}

            {/* コスト合計 */}
            <TableRow className="border-t-2 bg-gray-100">
              <TableCell className="sticky left-0 z-10 bg-gray-100 text-sm font-bold">コスト合計</TableCell>
              {MONTHS.map(m => (
                <TableCell key={m} className="text-right text-sm tabular-nums font-bold bg-gray-100">
                  {getGrandTotal(m) === 0 ? '—' : formatCurrency(getGrandTotal(m))}
                </TableCell>
              ))}
              <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-100">
                {formatCurrency(sumAcrossMonths(getGrandTotal))}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function SectionHeaderRow({ label, open, onToggle, getSubtotal }: {
  label: string; open: boolean; onToggle: () => void; getSubtotal: (m: string) => number
}) {
  return (
    <TableRow className="bg-gray-50 cursor-pointer hover:bg-gray-100" onClick={onToggle}>
      <TableCell className="sticky left-0 z-10 bg-gray-50 text-sm font-semibold">
        <span className="flex items-center gap-1">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {label}
        </span>
      </TableCell>
      {MONTHS.map(m => {
        const v = getSubtotal(m)
        return (
          <TableCell key={m} className="text-right text-sm tabular-nums font-medium bg-gray-50">
            {v === 0 ? '—' : formatCurrency(v)}
          </TableCell>
        )
      })}
      <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-50">
        {formatCurrency(sumAcrossMonths(getSubtotal))}
      </TableCell>
    </TableRow>
  )
}

function MonthlyDetailRow({ label, getAmount, linkHref }: {
  label: string; getAmount: (m: string) => number; linkHref?: string
}) {
  return (
    <TableRow className="transition-all duration-200">
      <TableCell className="sticky left-0 z-10 bg-white text-sm pl-8 text-gray-600">
        {linkHref ? (
          <Link href={linkHref} className="text-blue-600 hover:underline">{label}</Link>
        ) : label}
      </TableCell>
      {MONTHS.map(m => {
        const v = getAmount(m)
        return (
          <TableCell key={m} className="text-right text-sm tabular-nums">
            {v === 0 ? '—' : formatCurrency(v)}
          </TableCell>
        )
      })}
      <TableCell className="text-right text-sm tabular-nums bg-blue-50">
        {formatCurrency(sumAcrossMonths(getAmount))}
      </TableCell>
    </TableRow>
  )
}

function SubtotalRow({ getSubtotal }: { getSubtotal: (m: string) => number }) {
  return (
    <TableRow className="border-t">
      <TableCell className="sticky left-0 z-10 bg-white text-sm pl-8 font-medium text-gray-700">小計</TableCell>
      {MONTHS.map(m => (
        <TableCell key={m} className="text-right text-sm tabular-nums font-medium">
          {getSubtotal(m) === 0 ? '—' : formatCurrency(getSubtotal(m))}
        </TableCell>
      ))}
      <TableCell className="text-right text-sm tabular-nums font-bold bg-blue-50">
        {formatCurrency(sumAcrossMonths(getSubtotal))}
      </TableCell>
    </TableRow>
  )
}
