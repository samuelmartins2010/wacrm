import { DashboardOverview } from '@/components/superadmin/dashboard-overview'

export default function SuperAdminDashboardPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visão geral das contas. Receita, inadimplência e churn ficam de fora até
          o financeiro manual existir.
        </p>
      </div>
      <DashboardOverview />
    </div>
  )
}
