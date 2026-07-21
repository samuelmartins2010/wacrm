'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateAccountModal({ open, onClose, onCreated }: Props) {
  const [email, setEmail] = useState('')
  const [accountName, setAccountName] = useState('')
  const [plan, setPlan] = useState<'basic' | 'pro'>('basic')
  const [renewalDate, setRenewalDate] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setEmail('')
    setAccountName('')
    setPlan('basic')
    setRenewalDate('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !accountName) return

    setSaving(true)
    try {
      const res = await fetch('/api/superadmin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, accountName, plan, renewalDate }),
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? 'Erro ao criar conta')
        return
      }

      toast.success(`Conta criada! Convite enviado para ${email}`)
      onCreated()
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Conta</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail do cliente *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@exemplo.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accountName">Nome da conta *</Label>
            <Input
              id="accountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Clínica Odonto Saúde"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Plano</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v as 'basic' | 'pro')}>
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
            <Label htmlFor="renewalDate">Data de vencimento</Label>
            <Input
              id="renewalDate"
              type="date"
              value={renewalDate}
              onChange={(e) => setRenewalDate(e.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            O cliente receberá um e-mail de convite do Supabase para definir sua
            senha e acessar o sistema.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !email || !accountName}>
              {saving ? 'Criando...' : 'Criar e Convidar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
