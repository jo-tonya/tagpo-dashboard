'use client'

import React from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// ダッシュボードを「目標・KPI」「月次PL」の2タブで切り替える。
// 中身（client コンポーネント群）は server 側でレンダーして children として受け取る。
export function DashboardTabs({ kpi, pl }: { kpi: React.ReactNode; pl: React.ReactNode }) {
  return (
    <Tabs defaultValue="kpi" className="w-full">
      <TabsList className="h-9">
        <TabsTrigger value="kpi" className="px-4">目標・KPI</TabsTrigger>
        <TabsTrigger value="pl" className="px-4">月次PL</TabsTrigger>
      </TabsList>
      <TabsContent value="kpi" className="space-y-6 pt-2">
        {kpi}
      </TabsContent>
      <TabsContent value="pl" className="space-y-6 pt-2">
        {pl}
      </TabsContent>
    </Tabs>
  )
}
