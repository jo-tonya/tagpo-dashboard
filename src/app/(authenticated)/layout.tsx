import { AuthenticatedShell } from '@/components/layout/authenticated-shell'

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>
}
