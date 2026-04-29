'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ListChecks,
  FolderKanban,
  TrendingUp,
  Receipt,
  Shield,
  UserCog,
  ArrowDownToLine,
  Upload,
  Target,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/budgets', label: '予算管理', icon: Target },
  { href: '/milestones', label: '案件進行管理', icon: ListChecks },
  { href: '/campaigns', label: '案件一覧', icon: FolderKanban },
  { href: '/revenue', label: '事業収入', icon: TrendingUp },
  { href: '/costs', label: '事業コスト', icon: Receipt },
  { href: '/e-guardian', label: 'イー・ガーディアン', icon: Shield },
  { href: '/personnel', label: '人件費管理', icon: UserCog },
  // 「支払い管理」は現在サイドバー非表示。ページ自体は /payments に残置（将来復活時の手順は
  // src/app/(authenticated)/payments/page.tsx の冒頭コメント参照）。
  { href: '/receivables', label: '入金管理', icon: ArrowDownToLine },
  { href: '/import', label: 'インポート', icon: Upload },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r bg-white">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
            T
          </div>
          <span className="font-bold text-lg">Tagpo</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
