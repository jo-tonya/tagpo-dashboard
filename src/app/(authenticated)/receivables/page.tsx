import { ReceivableList } from '@/components/receivables/receivable-list'

export default function ReceivablesPage() {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">入金管理</h1>
      <ReceivableList initialMonth={currentMonth} />
    </div>
  )
}
