import { MilestoneBoard } from '@/components/milestones/milestone-board'

export default function MilestonesPage() {
  // 案件進行管理は tagpo-projects/tagpo-dashboard と同一実装の Client Component。
  // データ取得は MilestoneBoard 内で Supabase からクライアントサイドで行う。
  return <MilestoneBoard />
}
