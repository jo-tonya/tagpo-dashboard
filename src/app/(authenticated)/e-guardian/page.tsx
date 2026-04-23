import { getFixedCosts } from '@/lib/data/fixed-costs'
import { EGuardianTable } from '@/components/e-guardian/e-guardian-table'

export default async function EGuardianPage() {
  const fixedCosts = await getFixedCosts('e_guardian')
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">イー・ガーディアン管理</h1>
      <EGuardianTable initialData={fixedCosts} />
    </div>
  )
}
