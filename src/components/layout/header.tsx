'use client'

import { Menu } from 'lucide-react'

interface HeaderProps {
  onOpenMobile: () => void
}

export function Header({ onOpenMobile }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-white px-4 md:px-6">
      <button
        type="button"
        onClick={onOpenMobile}
        className="md:hidden rounded p-1 text-gray-600 hover:bg-gray-100"
        aria-label="メニューを開く"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="text-sm text-gray-500">事業管理システム</h1>
    </header>
  )
}
