'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'

// §22-3: 認証済みレイアウト全体を内包するクライアント Shell。
// サイドバーの折り畳み状態 (PC) とモバイル drawer の開閉状態を保持し、
// `localStorage('sidebar-collapsed')` で PC 折り畳みを永続化する。
export function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  // SSR では false。クライアント初回レンダリング時に localStorage から復元（軽いフリッカーは許容）。
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === '1'
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onToggleCollapse={() => setCollapsed(v => !v)}
      />

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <div
        className={[
          'flex flex-1 flex-col min-w-0 transition-[padding] duration-200',
          collapsed ? 'md:pl-14' : 'md:pl-60',
        ].join(' ')}
      >
        <Header onOpenMobile={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
