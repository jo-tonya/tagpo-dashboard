import { createClient } from '@/lib/supabase/server'
import { CostBreakdown } from '@/components/costs/cost-breakdown'

export default async function CostsPage() {
  const supabase = await createClient()

  // Fetch all cost data from Supabase
  const [fixedCostsRes, personnelRes, campaignCostsRes, campaignsRes] = await Promise.all([
    supabase.from('fixed_costs').select('*').order('target_month'),
    supabase.from('personnel_payments').select('*').order('target_month'),
    supabase.from('campaign_costs').select('*').order('target_month'),
    supabase.from('campaigns').select('id, maker, product, certainty'),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">事業コスト</h1>
      <CostBreakdown
        fixedCosts={fixedCostsRes.data || []}
        personnelPayments={personnelRes.data || []}
        campaignCosts={campaignCostsRes.data || []}
        campaigns={campaignsRes.data || []}
      />
    </div>
  )
}
