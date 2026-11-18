'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GatedButton } from '@/components/ui/gated-button';
import { useCan } from '@/hooks/use-can';
import type { ReactivationCampaign } from '@/types';
import {
  CampaignStatusBadge,
  ReactivationNav,
  fetchJson,
  formatDate,
} from '@/components/reactivation/shared';

interface ListResponse {
  campaigns: ReactivationCampaign[];
  stats: Record<string, Record<string, number>>;
}

export default function ReactivationCampaignsPage() {
  const t = useTranslations('Reactivation');
  const router = useRouter();
  const canManage = useCan('edit-settings');
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setData(await fetchJson<ListResponse>('/api/reactivation/campaigns'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sum = (s: Record<string, number> | undefined, keys: string[]) =>
    keys.reduce((acc, k) => acc + (s?.[k] ?? 0), 0);

  return (
    <div className="space-y-6">
      <ReactivationNav />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t('campaigns.title')}</h2>
        <GatedButton
          canAct={canManage}
          gateReason="create campaigns"
          onClick={() => router.push('/reactivation/campaigns/new')}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('campaigns.new')}
        </GatedButton>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <p className="text-sm text-red-400">{error}</p>
          <Button variant="outline" onClick={load}>
            {t('common.retry')}
          </Button>
        </div>
      ) : !data ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : data.campaigns.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t('campaigns.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('campaigns.name')}</TableHead>
                <TableHead>{t('campaigns.status')}</TableHead>
                <TableHead className="text-right">{t('campaigns.audience')}</TableHead>
                <TableHead className="text-right">{t('campaigns.inProgress')}</TableHead>
                <TableHead className="text-right">{t('campaigns.replied')}</TableHead>
                <TableHead>{t('campaigns.created')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.campaigns.map((c) => {
                const s = data.stats[c.id];
                const audience = sum(s, [
                  'pending',
                  'active',
                  'replied',
                  'completed',
                  'opted_out',
                  'failed',
                  'cancelled',
                ]);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={
                          c.status === 'draft'
                            ? `/reactivation/campaigns/new?id=${c.id}`
                            : `/reactivation/campaigns/${c.id}`
                        }
                        className="hover:text-primary hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{audience}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sum(s, ['pending', 'active'])}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{sum(s, ['replied'])}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
