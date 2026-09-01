'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Badge } from '@/components/ui/badge'

interface DashboardData {
  counts: {
    total: number
    active: number
    trial: number
    suspended: number
    pro: number
    basic: number
  }
  growth: { month: string; count: number }[]
  expiringSoon: { id: string; name: string; renewal_date: string | null }[]
  overdue: { id: string; name: string; renewal_date: string | null }[]
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: 'default' | 'warning' | 'danger' }) {
  const toneClass =
    tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-yellow-600' : 'text-foreground'
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
    </div>
  )
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

export function DashboardOverview() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/superadmin/dashboard', { cache: 'no-store' })
    if (res.ok) {
      setData(await res.json())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>
  }

  if (!data) {
    return <p className="text-sm text-destructive">Não foi possível carregar os dados do dashboard.</p>
  }

  const chartData = data.growth.map((g) => ({ label: formatMonthLabel(g.month), count: g.count }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total de contas" value={data.counts.total} />
        <KpiCard label="Ativas" value={data.counts.active} />
        <KpiCard label="Em trial" value={data.counts.trial} />
        <KpiCard label="Suspensas" value={data.counts.suspended} tone={data.counts.suspended > 0 ? 'danger' : 'default'} />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium mb-4">Crescimento de clientes · últimos 12 meses</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} width={30} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
              <Bar dataKey="count" name="Novas contas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Vencendo em breve (7 dias)</h2>
          {data.expiringSoon.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta vencendo esta semana.</p>
          ) : (
            <ul className="space-y-2">
              {data.expiringSoon.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span>{a.name}</span>
                  <Badge variant="secondary">
                    {a.renewal_date ? new Date(a.renewal_date).toLocaleDateString('pt-BR') : '—'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Vencidas, sem suspensão</h2>
          {data.overdue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta vencida pendente de ação.</p>
          ) : (
            <ul className="space-y-2">
              {data.overdue.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span>{a.name}</span>
                  <Badge variant="destructive">
                    {a.renewal_date ? new Date(a.renewal_date).toLocaleDateString('pt-BR') : '—'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
