import { notFound } from 'next/navigation'
import { CampaignForm } from '@/components/campaigns/campaign-form'
import { getCampaign, getCampaignSubcontracts, getCampaignCosts } from '@/lib/data/campaigns'

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const campaignId = parseInt(id)
  if (isNaN(campaignId)) notFound()

  const campaign = await getCampaign(campaignId)
  if (!campaign) notFound()

  const subcontracts = await getCampaignSubcontracts(campaignId)
  const costs = await getCampaignCosts(campaignId)
  const adDeliveryAmount = costs.find(c => c.cost_type === 'ad_delivery')?.amount ?? null
  const miscAmount = costs.find(c => c.cost_type === 'misc')?.amount ?? null

  return (
    <CampaignForm
      campaign={campaign}
      subcontracts={subcontracts}
      initialAdDeliveryAmount={adDeliveryAmount}
      initialMiscAmount={miscAmount}
      mode="edit"
    />
  )
}

