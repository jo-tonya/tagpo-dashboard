import { createClient } from '@/lib/supabase/server'
import { MonthlyBudget } from '../types'

// §20-3: unstable_cache は Supabase auth（cookies）と非互換のため不採用。
//   ページ側の export const revalidate と revalidatePath で対応する。
export async function getMonthlyBudgets(): Promise<MonthlyBudget[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monthly_budgets')
    .select('*')
    .order('month')
  if (error) {
    console.error('Error fetching monthly budgets:', error)
    return []
  }
  return (data || []).map(row => ({
    month: row.month as string,
    revenue: Number(row.revenue) || 0,
    gross_margin_rate: Number(row.gross_margin_rate) || 0,
    note: (row.note as string | null) || null,
  }))
}

export async function upsertMonthlyBudget(b: MonthlyBudget) {
  const supabase = await createClient()
  return await supabase
    .from('monthly_budgets')
    .upsert({
      month: b.month,
      revenue: b.revenue,
      gross_margin_rate: b.gross_margin_rate,
      note: b.note,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'month' })
}
