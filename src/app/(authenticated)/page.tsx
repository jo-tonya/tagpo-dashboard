import { PLSummaryTable } from '@/components/dashboard/pl-summary-table'
import { ProfitChart } from '@/components/dashboard/profit-chart'
import { BudgetActualSection } from '@/components/dashboard/budget-actual-section'
import { KpiSection } from '@/components/dashboard/kpi-section'
import { DashboardTabs } from '@/components/dashboard/dashboard-tabs'
import { getMonthlyPL, getRevenueDetails, getCostDetails, getCostStatusDetails } from '@/lib/data/dashboard'
import { getMonthlyBudgets } from '@/lib/data/budgets'
import { getKpiActuals, getKpiManualValues, getKpiActions, getKpiMonths } from '@/lib/data/kpi'

// §20-3: ページ単位で 60 秒キャッシュ。書き込み API 側の
// revalidatePath('/', 'layout') で即時無効化できる。
export const revalidate = 60

export default async function DashboardPage() {
  const [
    monthlyPL,
    revenueDetails,
    costDetails,
    costStatusDetails,
    budgets,
    kpiActuals,
    kpiManualValues,
    kpiActions,
  ] = await Promise.all([
    getMonthlyPL(),
    getRevenueDetails(),
    getCostDetails(),
    getCostStatusDetails(),
    getMonthlyBudgets(),
    getKpiActuals(),
    getKpiManualValues(),
    getKpiActions(),
  ])
  const kpiMonths = getKpiMonths()

  // 改修㉔: ダッシュボードを「目標・KPI」「月次PL」の2タブに分割（KPI を先頭・既定）。
  // 月次PL タブの並び順 (改修⑲):
  //   1. PLグラフ（事業利益推移） 2. PL表 3. 予実グラフ 4. 予実表
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
      </div>

      <DashboardTabs
        kpi={
          <KpiSection
            months={kpiMonths}
            actuals={kpiActuals}
            manualValues={kpiManualValues}
            actions={kpiActions}
          />
        }
        pl={
          <>
            {/* 1. PLグラフ */}
            <ProfitChart data={monthlyPL} />

            {/* 2. PL表 */}
            <PLSummaryTable
              data={monthlyPL}
              revenueDetails={revenueDetails}
              costDetails={costDetails}
              costStatusDetails={costStatusDetails}
            />

            {/* 3. 予実グラフ + 4. 予実表（タブ状態を共有） */}
            <BudgetActualSection monthlyPL={monthlyPL} budgets={budgets} />
          </>
        }
      />
    </div>
  )
}
