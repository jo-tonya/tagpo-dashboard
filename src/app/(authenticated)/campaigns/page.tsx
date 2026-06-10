import { CampaignList } from '@/components/campaigns/campaign-list'
import { getCampaigns, getCampaignCostMaps } from '@/lib/data/campaigns'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'

// §20-3: 60 秒キャッシュ。書き込み API の revalidatePath で無効化される。
export const revalidate = 60

export default async function CampaignsPage() {
  const [campaigns, costMaps] = await Promise.all([
    getCampaigns(),
    getCampaignCostMaps(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">案件一覧</h1>
          <p className="text-sm text-gray-500">全{campaigns.length}件</p>
        </div>
        <Link href="/campaigns/new">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            新規作成
          </Button>
        </Link>
      </div>
      <CampaignList campaigns={campaigns} costMaps={costMaps} />
    </div>
  )
}
