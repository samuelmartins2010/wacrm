'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCan } from '@/hooks/use-can';
import type {
  ReactivationCampaign,
  ReactivationEnrollment,
  ReactivationSendStatus,
} from '@/types';
import {
  CampaignStatusBadge,
  EnrollmentStatusBadge,
  fetchJson,
} from '@/components/reactivation/shared';

type EnrollmentRow = ReactivationEnrollment & {
  contact: { id: string; name: string | null; phone: string } | null;
};

interface DetailResponse {
  campaign: ReactivationCampaign;
  enrollments: EnrollmentRow[];
  sends: { enrollment_id: string; step: number; status: ReactivationSendStatus; error: string | null }[];
  conversations: Record<string, string>;
}

const POLL_MS = 5_000;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default function ReactivationCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('Reactivation');
  const canManage = useCan('edit-settings');
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchJson<DetailResponse>(`/api/reactivation/campaigns/${id}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const isActive = data?.campaign.status === 'active';
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [isActive, load]);

  const stats = useMemo(() => {
    const e = data?.enrollments ?? [];
    const s = data?.sends ?? [];
    const by = (st: string) => e.filter((x) => x.status === st).length;
    const sent = s.filter((x) => x.status !== 'failed');
    return {
      audience: e.filter((x) => x.status !== 'removed').length,
      sent: sent.length,
      delivered: s.filter((x) => x.status === 'delivered' || x.status === 'read').length,
      read: s.filter((x) => x.status === 'read').length,
      replied: by('replied'),
      optedOut: by('opted_out'),
      failed: by('failed'),
      inProgress: by('pending') + by('active'),
      returned: e.filter((x) => x.status === 'cancelled' && x.end_reason === 'returned_before_send').length,
    };
  }, [data]);

  async function act(action: 'pause' | 'resume' | 'finish') {
    setBusy(true);
    try {
      await fetchJson(`/api/reactivation/campaigns/${id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setConfirmFinish(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return error ? (
      <div className="flex flex-col items-center gap-2 py-10">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={load}>
          {t('common.retry')}
        </Button>
      </div>
    ) : (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const { campaign } = data;
  const lastError = (enrollmentId: string) =>
    data.sends.filter((s) => s.enrollment_id === enrollmentId && s.error && s.error !== 'in_progress').at(-1)?.error;

  return (
    <div className="space-y-6">
      <Link
        href="/reactivation/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('nav.campaigns')}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
          <CampaignStatusBadge status={campaign.status} />
        </div>
        {canManage && (
          <div className="flex gap-2">
            {campaign.status === 'draft' && (
              <Link href={`/reactivation/campaigns/new?id=${campaign.id}`}>
                <Button>{t('detail.editDraft')}</Button>
              </Link>
            )}
            {campaign.status === 'active' && (
              <Button variant="outline" disabled={busy} onClick={() => act('pause')}>
                {t('detail.pause')}
              </Button>
            )}
            {campaign.status === 'paused' && (
              <Button disabled={busy} onClick={() => act('resume')}>
                {t('detail.resume')}
              </Button>
            )}
            {(campaign.status === 'active' || campaign.status === 'paused') && (
              <Button variant="outline" disabled={busy} onClick={() => setConfirmFinish(true)}>
                {t('detail.finish')}
              </Button>
            )}
          </div>
        )}
      </div>

      {confirmFinish && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span>{t('detail.finishConfirm')}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmFinish(false)}>
              {t('common.back')}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => act('finish')}>
              {t('detail.finish')}
            </Button>
          </div>
        </div>
      )}

      {campaign.status === 'paused' && campaign.pause_reason && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">{t('detail.paused')}</p>
            <p className="text-muted-foreground">{campaign.pause_reason}</p>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={t('detail.audience')} value={stats.audience} />
        <Stat label={t('detail.sent')} value={stats.sent} />
        <Stat label={t('detail.delivered')} value={stats.delivered} />
        <Stat label={t('detail.read')} value={stats.read} />
        <Stat label={t('detail.replied')} value={stats.replied} />
        <Stat label={t('detail.inProgress')} value={stats.inProgress} />
        <Stat label={t('detail.optedOut')} value={stats.optedOut} />
        <Stat label={t('detail.failed')} value={stats.failed} />
        <Stat label={t('detail.returned')} value={stats.returned} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('detail.contact')}</TableHead>
              <TableHead>{t('detail.status')}</TableHead>
              <TableHead className="text-right">{t('detail.step')}</TableHead>
              <TableHead className="text-right">{t('detail.repliedAt')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.enrollments.map((e) => {
              const conv = data.conversations[e.contact_id];
              const err = e.status === 'failed' ? lastError(e.id) : null;
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {e.contact?.name || e.contact?.phone || '—'}
                    {err && <p className="text-xs font-normal text-red-400">{err}</p>}
                  </TableCell>
                  <TableCell>
                    <EnrollmentStatusBadge status={e.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.current_step}/{campaign.steps.length}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{e.replied_step ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    {conv && (
                      <Link href={`/inbox?c=${conv}`} className="text-sm text-primary hover:underline">
                        {t('detail.openChat')}
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
