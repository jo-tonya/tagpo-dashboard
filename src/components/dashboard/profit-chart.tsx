'use client'

import { MonthlyPL } from '@/lib/types'
import { formatMonth } from '@/lib/calculations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface ProfitChartProps {
  data: MonthlyPL[]
}

export function ProfitChart({ data }: ProfitChartProps) {
  const chartData = data.map((d) => ({
    month: formatMonth(d.month),
    売上: d.revenue,
    コスト: d.total_cost,
    事業利益: d.operating_profit,
  }))

  const formatYAxis = (value: number) => {
    if (value === 0) return '0'
    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`
    return value.toString()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">事業利益推移</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] md:h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [`¥${Number(value).toLocaleString('ja-JP')}`, undefined]}
              />
              <Legend />
              <ReferenceLine y={0} stroke="#666" />
              <Bar dataKey="売上" fill="#2563EB" radius={[2, 2, 0, 0]} />
              <Bar dataKey="コスト" fill="#9CA3AF" radius={[2, 2, 0, 0]} />
              <Bar dataKey="事業利益" fill="#16A34A" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
