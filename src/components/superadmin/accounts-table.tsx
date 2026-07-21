'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CreateAccountModal } from './create-account-modal'
import { EditAccountDrawer } from './edit-account-drawer'

type AccountStatus = 'active' | 'suspended' | 'trial'
type AccountPlan = 'basic' | 'pro'

interface AccountRow {
  id: string
  name: string
  owner_user_id: string
  status: AccountStatus
  plan: AccountPlan
  renewal_date: string | null
  notes: string | null
  suspended_at: string | null
  created_at: string
  profiles: { email: string; full_name: string } | null
}

const STATUS_BADGE: Record<AccountStatus, { label: string; variant: 'default' | 'destructive' | 'outline' | 'secondary' }> = {
  active: { label: 'Ativo', variant: 'default' },
  trial: { label: 'Trial', variant: 'secondary' },
  suspended: { label: 'Suspenso', variant: 'destructive' },
}

function isExpiringSoon(renewalDate: string | null): boolean {
  if (!renewalDate) return false
  const diff = new Date(renewalDate).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

function isExpired(renewalDate: string | null): boolean {
  if (!renewalDate) return false
  return new Date(renewalDate).getTime() < Date.now()
}

export function AccountsTable() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editAccount, setEditAccount] = useState<AccountRow | null>(null)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/superadmin/accounts', { cache: 'no-store' })
    if (res.ok) {
      const json = await res.json()
      setAccounts(json.accounts ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>+ Nova Conta</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Conta</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plano</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vencimento</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((acc) => {
                const expiring = isExpiringSoon(acc.renewal_date)
                const expired = isExpired(acc.renewal_date)
                const badge = STATUS_BADGE[acc.status]
                return (
                  <tr key={acc.id} className="bg-card hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{acc.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {acc.profiles?.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 capitalize">{acc.plan}</td>
                    <td className="px-4 py-3">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {acc.renewal_date ? (
                        <span className={
                          expired ? 'text-destructive font-medium' :
                          expiring ? 'text-yellow-600 font-medium' :
                          'text-foreground'
                        }>
                          {new Date(acc.renewal_date).toLocaleDateString('pt-BR')}
                          {expired && ' ⚠️'}
                          {expiring && !expired && ' 🔔'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditAccount(acc)}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma conta cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <CreateAccountModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={loadAccounts}
      />

      {editAccount && (
        <EditAccountDrawer
          account={editAccount}
          onClose={() => setEditAccount(null)}
          onSaved={loadAccounts}
        />
      )}
    </div>
  )
}
