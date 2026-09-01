'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
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

type Step = 0 | 1 | 2

const MIN_PASSWORD = 8

const SEGMENTS = [
  { value: 'clinic', label: 'Clínica Odontológica' },
  { value: 'courses', label: 'Cursos / Educação' },
  { value: 'services', label: 'Serviços Relacionados' },
  { value: 'other', label: 'Outro' },
]

export function OnboardingWizard() {
  const router = useRouter()
  const { accountId } = useAuth()
  const supabase = createClient()

  // Step 0 exists because the invite link only establishes a session —
  // Supabase never gives an invited user a usable password. Without
  // this step, the account is created but the client can never log in
  // again after this one magic-link session expires. See CHANGELOG /
  // project notes: this was broken (skipped entirely) before.
  const [step, setStep] = useState<Step>(0)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [settingPassword, setSettingPassword] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [segment, setSegment] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < MIN_PASSWORD) {
      setPasswordError(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`)
      return
    }
    if (password !== confirmPassword) {
      setPasswordError('As senhas não coincidem.')
      return
    }
    setPasswordError(null)
    setSettingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setPasswordError(error.message)
        return
      }
      setStep(1)
    } finally {
      setSettingPassword(false)
    }
  }

  if (step === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <form onSubmit={handleSetPassword} className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Defina sua senha</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Antes de continuar, crie uma senha para acessar sua conta.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-password">Nova senha</Label>
              <Input
                id="onboarding-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                disabled={settingPassword}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboarding-confirm-password">Confirmar senha</Label>
              <Input
                id="onboarding-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                disabled={settingPassword}
                required
              />
            </div>

            {passwordError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {passwordError}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={settingPassword || !password || !confirmPassword}
          >
            {settingPassword ? 'Salvando...' : 'Continuar →'}
          </Button>
        </form>
      </div>
    )
  }

  const handleSaveAndFinish = async () => {
    if (!accountId) return
    setSaving(true)
    setSaveError(null)
    try {
      // WhatsApp connection moved out of onboarding entirely — it's
      // configured later in Settings, where the exact same form
      // already exists (whatsapp-config.tsx). Forcing Meta credentials
      // before a brand-new trial user has even set those up in Meta
      // Business was blocking onboarding for no reason.
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: businessName }),
      })

      const json = await res.json()

      if (!res.ok) {
        setSaveError(json.error ?? 'Erro ao salvar')
        return
      }

      setStep(2)
    } finally {
      setSaving(false)
    }
  }

  if (step === 2) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-bold">Tudo configurado!</h1>
          <p className="text-muted-foreground">
            Seu CRM está pronto para uso.
          </p>
          <ul className="text-sm text-left space-y-2 text-muted-foreground">
            <li>→ Conecte seu WhatsApp em Configurações</li>
            <li>→ Importe seus primeiros contatos</li>
            <li>→ Configure respostas rápidas</li>
            <li>→ Convide sua equipe</li>
          </ul>
          <Button className="w-full" onClick={() => router.push('/dashboard')}>
            Ir para o Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Progress indicator */}
        <div className="flex gap-2">
          {[1].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Bem-vindo!</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Só mais um passo antes de começar.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Nome do negócio</Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Clínica Odonto Saúde"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Segmento</Label>
                <Select value={segment} onValueChange={(v) => { if (v) setSegment(v) }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="w-72">
                    {SEGMENTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {saveError && (
                <p className="text-sm text-destructive">{saveError}</p>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleSaveAndFinish}
              disabled={saving || !businessName}
            >
              {saving ? 'Salvando...' : 'Concluir ✓'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
