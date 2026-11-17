'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { cn } from '@/lib/utils';
import type { ReactivationBand, ReactivationSettings, Tag } from '@/types';
import type { Candidate } from '@/lib/reactivation/queries';
import {
  BandBadge,
  ReactivationNav,
  SELECT_CLASS,
  fetchJson,
} from '@/components/reactivation/shared';

interface InactiveResponse {
  counts: Record<ReactivationBand, number>;
  total: number;
  page: number;
  pageSize: number;
  contacts: Candidate[];
}

const BANDS: ReactivationBand[] = ['late', 'cooling', 'gone'];

export default function ReactivationPanelPage() {
  const t = useTranslations('Reactivation');
  const router = useRouter();
  const canManage = useCan('edit-settings');
  const [band, setBand] = useState<ReactivationBand | null>(null);
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(0);
  const [tags, setTags] = useState<Tag[]>([]);
  const [settings, setSettings] = useState<ReactivationSettings | null>(null);
  const [data, setData] = useState<InactiveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createClient()
      .from('tags')
      .select('*')
      .order('name')
      .then(({ data: rows }) => setTags((rows as Tag[]) ?? []));
    fetchJson<{ settings: ReactivationSettings }>('/api/reactivation/settings')
      .then((r) => setSettings(r.settings))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (band) qs.set('band', band);
      if (tag) qs.set('tag', tag);
      setData(await fetchJson<InactiveResponse>(`/api/reactivation/inactive?${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [band, tag, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const thresholds: Record<ReactivationBand, number> = {
    late: settings?.band_late_days ?? 30,
    cooling: settings?.band_cooling_days ?? 60,
    gone: settings?.band_gone_days ?? 120,
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function exclusionLabel(c: Candidate) {
    if (!c.exclusion) return t('exclusions.eligible');
    return t(`exclusions.${c.exclusion}`, { days: settings?.recent_outbound_days ?? 7 });
  }

  function createFromFilter() {
    const qs = new URLSearchParams();
    qs.set('bands', band ?? BANDS.join(','));
    if (tag) qs.set('tag', tag);
    router.push(`/reactivation/campaigns/new?${qs}`);
  }

  return (
    <div className="space-y-6">
      <ReactivationNav />

      <div className="grid gap-3 sm:grid-cols-3">
        {BANDS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => {
              setBand(band === b ? null : b);
              setPage(0);
            }}
            className={cn(
              'rounded-xl border bg-card/50 p-4 text-left transition-colors hover:border-primary/60',
              band === b ? 'border-primary' : 'border-border',
            )}
          >
            <div className="flex items-center justify-between">
              <BandBadge band={b} />
              <span className="text-xs text-muted-foreground">
                {t(`bandHint.${b}`, { days: thresholds[b] })}
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-foreground">
              {data ? data.counts[b] : '—'}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-64">
          <label className="mb-1 block text-xs text-muted-foreground">{t('panel.filterTag')}</label>
          <select
            className={SELECT_CLASS}
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('panel.allTags')}</option>
            {tags.map((tg) => (
              <option key={tg.id} value={tg.id}>
                {tg.name}
              </option>
            ))}
          </select>
        </div>
        <GatedButton
          canAct={canManage}
          gateReason="create campaigns"
          onClick={createFromFilter}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {t('panel.createFromFilter')}
        </GatedButton>
      </div>

      <p className="text-xs text-muted-foreground">{t('panel.explain')}</p>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2">
          <p className="text-sm text-red-400">{error}</p>
          <Button variant="outline" onClick={load}>
            {t('common.retry')}
          </Button>
        </div>
      ) : !data || data.contacts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t('panel.empty')}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('panel.name')}</TableHead>
                  <TableHead>{t('panel.phone')}</TableHead>
                  <TableHead className="text-right">{t('panel.days')}</TableHead>
                  <TableHead>{t('panel.band')}</TableHead>
                  <TableHead>{t('panel.situation')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.contacts.map((c) => (
                  <TableRow key={c.contact_id}>
                    <TableCell className="font-medium">{c.name || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.days}</TableCell>
                    <TableCell>
                      <BandBadge band={c.band} />
                    </TableCell>
                    <TableCell
                      className={cn('text-sm', c.exclusion ? 'text-muted-foreground' : 'text-primary')}
                    >
                      {exclusionLabel(c)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
              <span>{t('panel.page', { page: page + 1, pages })}</span>
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                {t('panel.prev')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                {t('panel.next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
