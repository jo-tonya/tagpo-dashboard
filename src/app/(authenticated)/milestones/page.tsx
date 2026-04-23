import { getCampaigns, getMilestoneChecks } from '@/lib/data/campaigns'
import { MilestoneDashboard } from '@/components/milestones/milestone-dashboard'

export default async function MilestonesPage() {
  const [campaigns, checksMap] = await Promise.all([
    getCampaigns(),
    getMilestoneChecks(),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">案件進行管理</h1>
      <MilestoneDashboard campaigns={campaigns} initialChecks={checksMap} />
    </div>
  )
}
