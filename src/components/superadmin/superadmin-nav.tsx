'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href?: string // omitted = not built yet, shown disabled
}

// Order and labels match the Clientizza Admin mockup's menu exactly.
// Only Dashboard and Clientes have a real page today — the rest are
// listed so the shell matches the target IA, but are disabled
// rather than linking to something that doesn't exist yet.
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/superadmin/dashboard' },
  { label: 'Clientes', href: '/superadmin/clientes' },
  { label: 'Assinaturas' },
  { label: 'Planos e módulos' },
  { label: 'WhatsApp' },
  { label: 'Financeiro' },
  { label: 'Contratos' },
  { label: 'Relatórios e uso' },
  { label: 'Configurações' },
]

export function SuperAdminNav() {
  const pathname = usePathname()

  return (
    <nav className="w-56 shrink-0 border-r bg-card px-3 py-4">
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href && pathname?.startsWith(item.href)
          if (!item.href) {
            return (
              <li key={item.label}>
                <span className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground/50 cursor-not-allowed">
                  {item.label}
                  <span className="text-[10px] uppercase tracking-wide">em breve</span>
                </span>
              </li>
            )
          }
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                className={cn(
                  'block px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
