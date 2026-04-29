import { getMonthlyBudgets } from '@/lib/data/budgets'
import { BudgetEditor } from '@/components/budgets/budget-editor'

export default async function BudgetsPage() {
  const budgets = await getMonthlyBudgets()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">予算管理</h1>
        <p className="text-sm text-gray-500">月次の売上予算と粗利率を入力します（粗利＝売上予算 × 粗利率）</p>
      </div>
      <BudgetEditor initialBudgets={budgets} />
    </div>
  )
}
