'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCan } from '@/hooks/use-can';
import { cn } from '@/lib/utils';
import type {
  MessageTemplate,
  ReactivationBand,
  ReactivationCampaign,
  ReactivationParam,
  ReactivationSettings,
  ReactivationStep,
  Tag,
} from '@/types';
import {
  countBodyVariables,
  isUsableTemplate,
  validateCampaignSteps,
  type Candidate,
} from '@/lib/reactivation/queries';
import { resolveParams } from '@/lib/reactivation/rules';
import { BandBadge, SELECT_CLASS, fetchJson } from './shared';

const BANDS: ReactivationBand[] = ['late', 'cooling', 'gone'];
const PARAM_SOURCES = ['first_name', 'name', 'company', 'fixed'] as const;

function emptyStep(): ReactivationStep {
  return { template_id: '', params: [], wait_days: 3 };
}

function paramsFor(template: MessageTemplate | undefined, prev: ReactivationParam[]): ReactivationParam[] {
  const n = template ? countBodyVariables(template.body_text) : 0;
  return Array.from({ length: n }, (_, i) => prev[i] ?? { source: i === 0 ? 'first_name' : 'fixed', value: '' } as ReactivationParam);
}

function renderBody(body: string, values: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => values[Number(n) - 1] ?? `{{${n}}}`);
}

function TagPicker({
  tags,
  selected,
  onChange,
  emptyLabel,
}: {
  tags: Tag[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
}) {
  if (!tags.length) return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tg) => {
        const on = selected.includes(tg.id);
        return (
          <button
            key={tg.id}
            type="button"
            onClick={() => onChange(on ? selected.filter((x) => x !== tg.id) : [...selected, tg.id])}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              on ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {tg.name}
          </button>
        );
      })}
    </div>
  );
}

export function CampaignWizard() {
  const t = useTranslations('Reactivation');
  const router = useRouter();
  const search = useSearchParams();
  const canManage = useCan('edit-settings');

  const [campaignId, setCampaignId] = useState<string | null>(search.get('id'));
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [bands, setBands] = useState<ReactivationBand[]>(() => {
    const b = (search.get('bands') ?? '').split(',').filter((x): x is ReactivationBand =>
      BANDS.includes(x as ReactivationBand),
    );
    return b.length ? b : [...BANDS];
  });
  const [tagIds, setTagIds] = useState<string[]>(() => (search.get('tag') ? [search.get('tag')!] : []));
  const [excludeTagIds, setExcludeTagIds] = useState<string[]>([]);
  const [steps, setSteps] = useState<ReactivationStep[]>([emptyStep()]);

  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [settings, setSettings] = useState<ReactivationSettings | null>(null);
  const [preview, setPreview] = useState<{ eligible: Candidate[]; excluded: Candidate[] } | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('tags').select('*').order('name'),
      supabase.from('message_templates').select('*').eq('status', 'APPROVED').order('name'),
      fetchJson<{ settings: ReactivationSettings }>('/api/reactivation/settings'),
      campaignId
        ? fetchJson<{ campaign: ReactivationCampaign }>(`/api/reactivation/campaigns/${campaignId}`)
        : Promise.resolve(null),
    ])
      .then(([tagRes, tplRes, settingsRes, campaignRes]) => {
        setTags((tagRes.data as Tag[]) ?? []);
        setTemplates(((tplRes.data as MessageTemplate[]) ?? []).filter(isUsableTemplate));
        setSettings(settingsRes.settings);
        if (campaignRes) {
          const c = campaignRes.campaign;
          if (c.status !== 'draft') {
            router.replace(`/reactivation/campaigns/${c.id}`);
            return;
          }
          setName(c.name);
          setBands(c.bands);
          setTagIds(c.tag_ids);
          setExcludeTagIds(c.exclude_tag_ids);
          setSteps(c.steps.length ? c.steps : [emptyStep()]);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templateById = useMemo(() => new Map(templates.map((x) => [x.id, x])), [templates]);
  const stepsError = useMemo(() => validateCampaignSteps(steps, templates), [steps, templates]);
  const eligibleNow = preview ? preview.eligible.filter((c) => !removed.has(c.contact_id)) : [];

  function updateStep(i: number, patch: Partial<ReactivationStep>) {
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  async function saveAndPreview() {
    setBusy(true);
    setError(null);
    try {
      const body = JSON.stringify({ name, bands, tag_ids: tagIds, exclude_tag_ids: excludeTagIds, steps });
      let id = campaignId;
      if (id) {
        await fetchJson(`/api/reactivation/campaigns/${id}`, { method: 'PATCH', body });
      } else {
        const r = await fetchJson<{ campaign: ReactivationCampaign }>('/api/reactivation/campaigns', {
          method: 'POST',
          body,
        });
        id = r.campaign.id;
        setCampaignId(id);
        router.replace(`/reactivation/campaigns/new?id=${id}`);
      }
      setPreview(await fetchJson(`/api/reactivation/campaigns/${id}/preview`));
      setRemoved(new Set());
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!campaignId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/reactivation/campaigns/${campaignId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', removedContactIds: [...removed] }),
      });
      router.push(`/reactivation/campaigns/${campaignId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setBusy(false);
    }
  }

  async function deleteDraft() {
    if (!campaignId) return;
    setBusy(true);
    try {
      await fetchJson(`/api/reactivation/campaigns/${campaignId}`, { method: 'DELETE' });
      router.push('/reactivation/campaigns');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">{t('wizard.adminOnly')}</p>;
  }

  const stepLabels = [t('wizard.stepAudience'), t('wizard.stepTouches'), t('wizard.stepReview')];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t('wizard.title')}</h1>

      <ol className="flex gap-2 text-sm">
        {stepLabels.map((label, i) => (
          <li
            key={label}
            className={cn(
              'flex-1 rounded-lg border px-3 py-2',
              i === step ? 'border-primary text-foreground' : 'border-border text-muted-foreground',
            )}
          >
            <span className="mr-1 tabular-nums">{i + 1}.</span>
            {label}
          </li>
        ))}
      </ol>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
      )}

      {step === 0 && (
        <div className="space-y-5 rounded-xl border border-border bg-card/50 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t('wizard.name')}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('wizard.namePlaceholder')} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{t('wizard.bands')}</p>
            <div className="flex flex-wrap gap-4">
              {BANDS.map((b) => (
                <label key={b} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={bands.includes(b)}
                    onChange={(e) => setBands(e.target.checked ? [...bands, b] : bands.filter((x) => x !== b))}
                  />
                  <BandBadge band={b} />
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{t('wizard.includeTags')}</p>
            <TagPicker tags={tags} selected={tagIds} onChange={setTagIds} emptyLabel={t('common.noTags')} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{t('wizard.excludeTags')}</p>
            <TagPicker
              tags={tags}
              selected={excludeTagIds}
              onChange={setExcludeTagIds}
              emptyLabel={t('common.noTags')}
            />
          </div>
          <div className="flex justify-between">
            {campaignId ? (
              <Button variant="outline" onClick={deleteDraft} disabled={busy}>
                {t('wizard.deleteDraft')}
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={() => setStep(1)} disabled={!name.trim() || bands.length === 0}>
              {t('wizard.next')}
            </Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('wizard.touchHint')}</p>
          {templates.length === 0 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              {t('wizard.noTemplates')}
            </p>
          )}
          {steps.map((s, i) => {
            const tpl = templateById.get(s.template_id);
            return (
              <div key={i} className="space-y-3 rounded-xl border border-border bg-card/50 p-5">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{t('wizard.touch', { n: i + 1 })}</p>
                  {steps.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('wizard.removeTouch')}
                    </Button>
                  )}
                </div>
                {i === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('wizard.waitFirst')}</p>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    <span>{t('wizard.waitDays')}</span>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      className="w-20"
                      value={s.wait_days}
                      onChange={(e) => updateStep(i, { wait_days: Number(e.target.value) })}
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t('wizard.template')}</label>
                  <select
                    className={SELECT_CLASS}
                    value={s.template_id}
                    onChange={(e) => {
                      const next = templateById.get(e.target.value);
                      updateStep(i, { template_id: e.target.value, params: paramsFor(next, s.params) });
                    }}
                  >
                    <option value="">{t('wizard.chooseTemplate')}</option>
                    {templates.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({x.language})
                      </option>
                    ))}
                  </select>
                </div>
                {tpl && (
                  <>
                    <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{tpl.body_text}</p>
                    {s.params.map((p, k) => (
                      <div key={k} className="grid gap-2 sm:grid-cols-[120px_1fr_1fr] sm:items-center">
                        <span className="text-xs text-muted-foreground">{t('wizard.variable', { n: k + 1 })}</span>
                        <select
                          className={SELECT_CLASS}
                          value={p.source}
                          onChange={(e) => {
                            const src = e.target.value as (typeof PARAM_SOURCES)[number];
                            const params = [...s.params];
                            params[k] = src === 'fixed' ? { source: 'fixed', value: '' } : { source: src };
                            updateStep(i, { params });
                          }}
                        >
                          {PARAM_SOURCES.map((src) => (
                            <option key={src} value={src}>
                              {t(`params.${src}`)}
                            </option>
                          ))}
                        </select>
                        {p.source === 'fixed' && (
                          <Input
                            value={p.value}
                            placeholder={t('wizard.fixedPlaceholder')}
                            onChange={(e) => {
                              const params = [...s.params];
                              params[k] = { source: 'fixed', value: e.target.value };
                              updateStep(i, { params });
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
          {steps.length < 3 && (
            <Button variant="outline" onClick={() => setSteps([...steps, emptyStep()])}>
              <Plus className="h-4 w-4" />
              {t('wizard.addTouch')}
            </Button>
          )}
          {stepsError && steps.some((s) => s.template_id) && (
            <p className="text-sm text-amber-600 dark:text-amber-400">{stepsError}</p>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}>
              {t('common.back')}
            </Button>
            <Button onClick={saveAndPreview} disabled={busy || !!stepsError}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('wizard.review')}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card/50 p-5">
            <p className="font-medium">{t('wizard.eligible', { count: eligibleNow.length })}</p>
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
              {preview.eligible.map((c) => {
                const isRemoved = removed.has(c.contact_id);
                return (
                  <div
                    key={c.contact_id}
                    className={cn('flex items-center justify-between rounded-lg px-2 py-1.5 text-sm', isRemoved && 'opacity-50')}
                  >
                    <span className="flex items-center gap-2">
                      <BandBadge band={c.band} />
                      {c.name || c.phone} <span className="text-xs text-muted-foreground">· {c.days}d</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = new Set(removed);
                        if (isRemoved) next.delete(c.contact_id);
                        else next.add(c.contact_id);
                        setRemoved(next);
                      }}
                    >
                      {isRemoved ? t('wizard.restore') : t('wizard.remove')}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {preview.excluded.length > 0 && (
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <p className="font-medium">{t('wizard.excluded', { count: preview.excluded.length })}</p>
              <div className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
                {preview.excluded.map((c) => (
                  <div key={c.contact_id} className="flex justify-between px-2 py-1 text-muted-foreground">
                    <span>{c.name || c.phone}</span>
                    <span>{t(`exclusions.${c.exclusion!}`, { days: settings?.recent_outbound_days ?? 7 })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-border bg-card/50 p-5">
            <p className="font-medium">{t('wizard.preview')}</p>
            {eligibleNow[0] && (
              <p className="text-xs text-muted-foreground">
                {t('wizard.previewFor', { name: eligibleNow[0].name || eligibleNow[0].phone || '' })}
              </p>
            )}
            {steps.map((s, i) => {
              const tpl = templateById.get(s.template_id);
              if (!tpl) return null;
              const values = resolveParams(s.params, {
                name: eligibleNow[0]?.name ?? null,
                company: eligibleNow[0]?.company ?? null,
              });
              return (
                <div key={i}>
                  <p className="mb-1 text-xs text-muted-foreground">
                    {t('wizard.touch', { n: i + 1 })}
                    {i > 0 && ` · +${s.wait_days}d`}
                  </p>
                  <p className="whitespace-pre-wrap rounded-lg bg-primary/10 p-3 text-sm">
                    {renderBody(tpl.body_text, values)}
                  </p>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              {t('wizard.limits', { limit: settings?.daily_limit ?? 50 })}
            </p>
          </div>

          <p className="text-sm">{t('wizard.approveConfirm', { count: eligibleNow.length })}</p>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
              {t('common.back')}
            </Button>
            <Button onClick={approve} disabled={busy || eligibleNow.length === 0}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? t('wizard.approving') : t('wizard.approve')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
