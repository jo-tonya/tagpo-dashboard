import { getCampaigns } from '@/lib/data/campaigns'
import { RevenueMatrix } from '@/components/revenue/revenue-matrix'

export default async function RevenuePage() {
  const campaigns = await getCampaigns()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">事業収入</h1>
      <RevenueMatrix campaigns={campaigns} />
    </div>
  )
}
