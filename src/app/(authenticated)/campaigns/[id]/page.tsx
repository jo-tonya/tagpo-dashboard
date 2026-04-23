import { notFound } from 'next/navigation'
import { CampaignForm } from '@/components/campaigns/campaign-form'
import { getCampaign, getCampaignSubcontracts } from '@/lib/data/campaigns'

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

  return <CampaignForm campaign={campaign} subcontracts={subcontracts} mode="edit" />
}
