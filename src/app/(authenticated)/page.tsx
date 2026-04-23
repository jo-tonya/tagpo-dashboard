import { PLSummaryTable } from '@/components/dashboard/pl-summary-table'
import { ProfitChart } from '@/components/dashboard/profit-chart'
import { getMonthlyPL, getRevenueDetails, getCostDetails, getCostStatusDetails } from '@/lib/data/dashboard'

export default async function DashboardPage() {
  const [monthlyPL, revenueDetails, costDetails, costStatusDetails] = await Promise.all([
    getMonthlyPL(),
    getRevenueDetails(),
    getCostDetails(),
    getCostStatusDetails(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-gray-500">月次PLサマリー</p>
      </div>
      <PLSummaryTable
        data={monthlyPL}
        revenueDetails={revenueDetails}
        costDetails={costDetails}
        costStatusDetails={costStatusDetails}
      />
      <ProfitChart data={monthlyPL} />
    </div>
  )
}
