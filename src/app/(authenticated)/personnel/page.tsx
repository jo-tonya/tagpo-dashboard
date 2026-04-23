import { getPersonnel, getPersonnelPayments } from '@/lib/data/personnel'
import { PersonnelTable } from '@/components/personnel/personnel-table'

export default async function PersonnelPage() {
  const [personnel, payments] = await Promise.all([
    getPersonnel(),
    getPersonnelPayments(),
  ])
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">人件費管理</h1>
      <PersonnelTable personnel={personnel} payments={payments} />
    </div>
  )
}
