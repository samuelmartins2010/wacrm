import { AccountsTable } from '@/components/superadmin/accounts-table'

export default function SuperAdminPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie clientes, planos e status de acesso.
          </p>
        </div>
      </div>
      <AccountsTable />
    </div>
  )
}
