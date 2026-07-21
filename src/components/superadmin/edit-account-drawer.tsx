'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type AccountStatus = 'active' | 'suspended' | 'trial'
type AccountPlan = 'basic' | 'pro'

interface Account {
  id: string
  name: string
  status: AccountStatus
  plan: AccountPlan
  renewal_date: string | null
  notes: string | null
  profiles: { email: string; full_name: string } | null
}

interface Props {
  account: Account
  onClose: () => void
  onSaved: () => void
}

export function EditAccountDrawer({ account, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<AccountStatus>(account.status)
  const [plan, setPlan] = useState<AccountPlan>(account.plan)
  const [renewalDate, setRenewalDate] = useState(account.renewal_date ?? '')
  const [notes, setNotes] = useState(account.notes ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/superadmin/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          plan,
          renewal_date: renewalDate || null,
          notes: notes || null,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Erro ao salvar')
        return
      }

      toast.success('Conta atualizada')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md space-y-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{account.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {account.profiles?.email ?? ''}
          </p>
        </SheetHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AccountStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">✅ Ativo</SelectItem>
                <SelectItem value="trial">🔔 Trial</SelectItem>
                <SelectItem value="suspended">⏸ Suspenso</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Plano</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v as AccountPlan)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="renewal">Data de vencimento</Label>
            <Input
              id="renewal"
              type="date"
              value={renewalDate}
              onChange={(e) => setRenewalDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações internas</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: pagou via Pix em 20/07, plano anual..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
