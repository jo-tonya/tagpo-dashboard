import { PaymentList } from '@/components/payments/payment-list'

export default function PaymentsPage() {
  // Default to current month (first day)
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">支払い管理</h1>
      <PaymentList initialMonth={currentMonth} />
    </div>
  )
}
