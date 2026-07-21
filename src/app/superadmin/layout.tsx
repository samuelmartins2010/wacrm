import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdminEmail } from '@/lib/superadmin/auth'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isSuperAdminEmail(user.email, process.env.SUPER_ADMIN_EMAIL)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card px-6 py-3 flex items-center gap-3">
        <span className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-widest">
          Super Admin
        </span>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}
