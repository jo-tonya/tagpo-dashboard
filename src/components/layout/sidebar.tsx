'use client'

import Link from 'next/link'
import Image from 'next/image'
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
  Target,
  ChevronLeft,
  ChevronRight,
  X,
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
  // 「入金管理」「インポート」は廃止（改修㉔）。
]

interface SidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onCloseMobile: () => void
  onToggleCollapse: () => void
}

// §22-4: PC では expanded(240) / collapsed(56) の 2 段階、
// モバイルでは drawer (240 を画面外から overlay でスライドイン) として動作する。
// 折り畳み時のラベル表示はブラウザ標準 title 属性で代替（shadcn Tooltip 未導入のため）。
export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col border-r bg-white transition-[width,transform] duration-200',
        // モバイルは常に 240px、PC は collapsed に応じて 56 / 240
        'w-60',
        collapsed ? 'md:w-14' : 'md:w-60',
        // モバイルの開閉。PC では常に表示。
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-3">
        <Link
          href="/"
          className={cn(
            'flex items-center overflow-hidden',
            collapsed && 'md:justify-center',
          )}
          onClick={onCloseMobile}
        >
          {/* ロゴ（ワードマーク）。展開時はフル表示、折り畳み時は幅に収める。 */}
          <Image
            src="/tagpo-logo.png"
            alt="Tagpo"
            width={2161}
            height={933}
            priority
            className={cn(
              'object-contain object-left',
              collapsed ? 'h-6 w-auto md:h-auto md:w-8' : 'h-6 w-auto',
            )}
          />
        </Link>
        <button
          type="button"
          onClick={onCloseMobile}
          className="md:hidden rounded p-1 text-gray-500 hover:bg-gray-100"
          aria-label="メニューを閉じる"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onCloseMobile}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    collapsed && 'md:justify-center md:px-2',
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={cn(collapsed && 'md:hidden')}>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="hidden md:flex border-t p-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700',
            collapsed && 'justify-center px-2',
          )}
          aria-label={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>サイドバーをしまう</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
