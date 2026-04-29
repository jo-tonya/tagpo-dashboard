import { PLSummaryTable } from '@/components/dashboard/pl-summary-table'
import { ProfitChart } from '@/components/dashboard/profit-chart'
import { BudgetActualSection } from '@/components/dashboard/budget-actual-section'
import { getMonthlyPL, getRevenueDetails, getCostDetails, getCostStatusDetails } from '@/lib/data/dashboard'
import { getMonthlyBudgets } from '@/lib/data/budgets'

export default async function DashboardPage() {
  const [monthlyPL, revenueDetails, costDetails, costStatusDetails, budgets] = await Promise.all([
    getMonthlyPL(),
    getRevenueDetails(),
    getCostDetails(),
    getCostStatusDetails(),
    getMonthlyBudgets(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-gray-500">月次PL</p>
      </div>
      <BudgetActualSection monthlyPL={monthlyPL} budgets={budgets} />
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
