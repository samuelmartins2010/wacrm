'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type {
  ReactivationBand,
  ReactivationCampaignStatus,
  ReactivationEnrollmentStatus,
} from '@/types';

export const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60';

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

export function ReactivationNav() {
  const t = useTranslations('Reactivation');
  const pathname = usePathname();
  const items = [
    { href: '/reactivation', label: t('nav.panel'), exact: true },
    { href: '/reactivation/campaigns', label: t('nav.campaigns'), exact: false },
    { href: '/reactivation/settings', label: t('nav.settings'), exact: false },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <nav className="flex gap-1 border-b border-border">
        {items.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

const BAND_CLASS: Record<ReactivationBand, string> = {
  late: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  cooling: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  gone: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

export function BandBadge({ band }: { band: ReactivationBand }) {
  const t = useTranslations('Reactivation.bands');
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', BAND_CLASS[band])}>
      {t(band)}
    </span>
  );
}

const CAMPAIGN_CLASS: Record<ReactivationCampaignStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-primary/15 text-primary',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  finished: 'bg-secondary text-secondary-foreground',
};

export function CampaignStatusBadge({ status }: { status: ReactivationCampaignStatus }) {
  const t = useTranslations('Reactivation.campaignStatus');
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', CAMPAIGN_CLASS[status])}>
      {t(status)}
    </span>
  );
}

const ENROLLMENT_CLASS: Record<ReactivationEnrollmentStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  active: 'bg-primary/15 text-primary',
  replied: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  completed: 'bg-secondary text-secondary-foreground',
  opted_out: 'bg-red-500/15 text-red-600 dark:text-red-400',
  failed: 'bg-red-500/15 text-red-600 dark:text-red-400',
  removed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
};

export function EnrollmentStatusBadge({ status }: { status: ReactivationEnrollmentStatus }) {
  const t = useTranslations('Reactivation.enrollmentStatus');
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', ENROLLMENT_CLASS[status])}>
      {t(status)}
    </span>
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
