'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
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

type Step = 1 | 2 | 3

const SEGMENTS = [
  { value: 'clinic', label: 'Clínica Odontológica' },
  { value: 'courses', label: 'Cursos / Educação' },
  { value: 'services', label: 'Serviços Relacionados' },
  { value: 'other', label: 'Outro' },
]

export function OnboardingWizard() {
  const router = useRouter()
  const { accountId } = useAuth()

  const [step, setStep] = useState<Step>(1)
  const [businessName, setBusinessName] = useState('')
  const [segment, setSegment] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSaveAndFinish = async () => {
    if (!accountId) return
    setSaving(true)
    setSaveError(null)
    try {
      // Delegate to the existing config endpoint which handles
      // credential verification, encryption, and registration.
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          access_token: accessToken,
          // business_name is stored on the account row, not the config.
          ...(businessName ? { business_name: businessName } : {}),
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setSaveError(json.error ?? 'Erro ao salvar configuração')
        return
      }

      setStep(3)
    } finally {
      setSaving(false)
    }
  }

  if (step === 3) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-bold">Tudo configurado!</h1>
          <p className="text-muted-foreground">
            Seu CRM está pronto para uso.
          </p>
          <ul className="text-sm text-left space-y-2 text-muted-foreground">
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
          {[1, 2].map((s) => (
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
                Vamos configurar seu CRM em 2 passos rápidos.
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
                  <SelectContent>
                    {SEGMENTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="w-full" onClick={() => setStep(2)}>
              Próximo →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Conectar WhatsApp</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Cole as credenciais do Meta Business.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                <Input
                  id="phoneNumberId"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="1234567890"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wabaId">WhatsApp Business Account ID</Label>
                <Input
                  id="wabaId"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  placeholder="0987654321"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accessToken">Token de Acesso</Label>
                <Input
                  id="accessToken"
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAABcde..."
                />
              </div>

              {saveError && (
                <p className="text-sm text-destructive">{saveError}</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                ← Voltar
              </Button>
            </div>

            <Button
              className="w-full"
              onClick={handleSaveAndFinish}
              disabled={saving || !phoneNumberId || !wabaId || !accessToken}
            >
              {saving ? 'Salvando...' : 'Salvar e Concluir ✓'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
