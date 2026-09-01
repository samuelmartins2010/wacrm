import { redirect } from 'next/navigation'
import { requirePlatformAdmin } from '@/lib/superadmin/auth'
import { SuperAdminNav } from '@/components/superadmin/superadmin-nav'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    await requirePlatformAdmin()
  } catch {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card px-6 py-3 flex items-center gap-3">
        <span className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-widest">
          Super Admin
        </span>
      </div>
      <div className="flex">
        <SuperAdminNav />
        <div className="flex-1 p-6">{children}</div>
      </div>
    </div>
  )
}
