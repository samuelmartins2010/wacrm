'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/hooks/use-can';
import type { ReactivationSettings, SendWindow } from '@/types';
import { ReactivationNav, SELECT_CLASS, fetchJson } from '@/components/reactivation/shared';

const HOURS = Array.from({ length: 25 }, (_, h) => h);

function HoursRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: [number, number] | null;
  onChange: (v: [number, number] | null) => void;
  disabled: boolean;
}) {
  const t = useTranslations('Reactivation.settings');
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[160px_auto_1fr]">
      <span className="text-sm">{label}</span>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={value === null}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? null : [9, 18])}
        />
        {t('closed')}
      </label>
      {value && (
        <div className="flex items-center gap-2 text-sm">
          <span>{t('from')}</span>
          <select
            className={`${SELECT_CLASS} w-24`}
            value={value[0]}
            disabled={disabled}
            onChange={(e) => onChange([Number(e.target.value), value[1]])}
          >
            {HOURS.slice(0, 24).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}h
              </option>
            ))}
          </select>
          <span>{t('to')}</span>
          <select
            className={`${SELECT_CLASS} w-24`}
            value={value[1]}
            disabled={disabled}
            onChange={(e) => onChange([value[0], Number(e.target.value)])}
          >
            {HOURS.slice(1).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}h
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default function ReactivationSettingsPage() {
  const t = useTranslations('Reactivation');
  const canEdit = useCan('edit-settings');
  const [s, setS] = useState<ReactivationSettings | null>(null);
  const [keywords, setKeywords] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchJson<{ settings: ReactivationSettings }>('/api/reactivation/settings')
      .then((r) => {
        setS(r.settings);
        setKeywords(r.settings.optout_keywords.join(', '));
      })
      .catch((e) => setMsg({ ok: false, text: e instanceof Error ? e.message : t('common.error') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetchJson<{ settings: ReactivationSettings }>('/api/reactivation/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...s,
          optout_keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        }),
      });
      setS(r.settings);
      setMsg({ ok: true, text: t('common.saved') });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t('common.error') });
    } finally {
      setBusy(false);
    }
  }

  const num = (key: keyof ReactivationSettings, label: string, suffix = t('settings.days')) => (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-48">{label}</span>
      <Input
        type="number"
        min={0}
        className="w-24"
        disabled={!canEdit}
        value={s ? (s[key] as number) : ''}
        onChange={(e) => s && setS({ ...s, [key]: Number(e.target.value) })}
      />
      <span className="text-muted-foreground">{suffix}</span>
    </label>
  );

  const setWindow = (k: keyof SendWindow, v: [number, number] | null) =>
    s && setS({ ...s, send_window: { ...s.send_window, [k]: v } });

  return (
    <div className="space-y-6">
      <ReactivationNav />
      {!s ? (
        msg ? (
          <p className="text-sm text-red-400">{msg.text}</p>
        ) : (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )
      ) : (
        <div className="max-w-2xl space-y-6">
          <section className="space-y-3 rounded-xl border border-border bg-card/50 p-5">
            <h2 className="font-medium">{t('settings.bands')}</h2>
            {num('band_late_days', t('settings.late'))}
            {num('band_cooling_days', t('settings.cooling'))}
            {num('band_gone_days', t('settings.gone'))}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card/50 p-5">
            {num('rest_days', t('settings.rest'))}
            {num('recent_outbound_days', t('settings.recent'))}
            {num('daily_limit', t('settings.dailyLimit'), '')}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card/50 p-5">
            <h2 className="font-medium">{t('settings.window')}</h2>
            <HoursRow label={t('settings.monFri')} value={s.send_window.mon_fri} disabled={!canEdit} onChange={(v) => setWindow('mon_fri', v)} />
            <HoursRow label={t('settings.sat')} value={s.send_window.sat} disabled={!canEdit} onChange={(v) => setWindow('sat', v)} />
            <HoursRow label={t('settings.sun')} value={s.send_window.sun} disabled={!canEdit} onChange={(v) => setWindow('sun', v)} />
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card/50 p-5">
            <label className="block text-sm font-medium">{t('settings.optout')}</label>
            <Input value={keywords} disabled={!canEdit} onChange={(e) => setKeywords(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('settings.optoutHint')}</p>
            <label className="block text-sm font-medium">{t('settings.optoutReply')}</label>
            <Textarea
              value={s.optout_reply}
              disabled={!canEdit}
              onChange={(e) => setS({ ...s, optout_reply: e.target.value })}
            />
          </section>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={!canEdit || busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
            {msg && <span className={msg.ok ? 'text-sm text-primary' : 'text-sm text-red-400'}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
