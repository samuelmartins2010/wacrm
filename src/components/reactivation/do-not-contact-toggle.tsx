'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BellOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/hooks/use-can';
import type { Contact } from '@/types';
import { fetchJson } from './shared';

/** Selo + chave "Não quer receber campanhas" na ficha do contato. */
export function DoNotContactToggle({
  contact,
  onChanged,
}: {
  contact: Contact;
  onChanged?: (value: boolean) => void;
}) {
  const t = useTranslations('Reactivation.contact');
  const canEdit = useCan('edit-settings');
  const [value, setValue] = useState(!!contact.do_not_contact);
  const [source, setSource] = useState(contact.do_not_contact_source ?? null);
  const [busy, setBusy] = useState(false);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      await fetchJson(`/api/contacts/${contact.id}/do-not-contact`, {
        method: 'PUT',
        body: JSON.stringify({ value: next }),
      });
      setValue(next);
      setSource('manual');
      onChanged?.(next);
    } finally {
      setBusy(false);
    }
  }

  if (!value && !canEdit) return null;

  return (
    <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <div className="text-xs">
        <p className={`flex items-center gap-1 font-medium ${value ? 'text-red-500' : 'text-foreground'}`}>
          <BellOff className="size-3" />
          {t('doNotContact')}
          {value && source && (
            <span className="font-normal text-muted-foreground">
              · {source === 'reativacao_sair' ? t('sourceOptout') : t('sourceManual')}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-muted-foreground">{t('doNotContactHint')}</p>
      </div>
      {canEdit && (
        <Switch
          checked={value}
          disabled={busy}
          onCheckedChange={(v) => toggle(!!v)}
          aria-label={t('doNotContact')}
        />
      )}
    </div>
  );
}
