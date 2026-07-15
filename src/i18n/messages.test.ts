import { parse } from '@formatjs/icu-messageformat-parser';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ptBR from '../../messages/pt-BR.json';
import { SETTINGS_SECTIONS } from '../components/settings/settings-sections';

const LOCALES = { en, 'pt-BR': ptBR } as const;

function leafPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    leafPaths(value, prefix ? `${prefix}.${key}` : key)
  );
}

function get(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (typeof acc !== 'object' || acc === null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

// Content that is intentionally NOT valid ICU MessageFormat: literal
// "{{1}}"-style example syntax, or an HTML tag with an inline attribute
// (next-intl's rich-text tags must be bare, e.g. <strong>, with styling
// supplied by a renderer — attributes baked into the message string break
// the parser). Every key here must be read via t.raw() at its call site —
// see raw-usage.test.ts, which pins down each call site.
const RAW_ONLY_KEYS = [
  'Broadcasts.wizard.personalize.varDesc',
  'Automations.builder.config.placeholderValue',
  'Automations.builder.config.placeholderHeaders',
  'Automations.builder.config.placeholderBody',
  'Settings.templates.headerTextPlaceholder',
  'Settings.templates.headerSamplePlaceholder',
  'Settings.templates.bodyPlaceholder',
  'Settings.templates.bodyHint',
  'Settings.templates.urlPlaceholder',
  'Settings.templates.urlSamplePlaceholder',
  'Settings.whatsapp.pinHint',
  'Settings.whatsapp.step1_1',
  'Settings.whatsapp.step3_2',
  'Settings.whatsapp.step3_3',
  'Settings.whatsapp.step3_4',
  'Settings.whatsapp.step4_3',
  'Settings.whatsapp.step4_4',
];

describe('locale message parity', () => {
  it('en.json and pt-BR.json define exactly the same leaf keys', () => {
    expect(leafPaths(ptBR).sort()).toEqual(leafPaths(en).sort());
  });
});

describe('Settings.sections has a label for every SETTINGS_SECTIONS id', () => {
  for (const [localeName, messages] of Object.entries(LOCALES)) {
    for (const id of SETTINGS_SECTIONS) {
      it(`${localeName}: "${id}"`, () => {
        const errors: unknown[] = [];
        const t = createTranslator({
          locale: localeName,
          messages,
          namespace: 'Settings.sections',
          onError: (e) => errors.push(e),
        });
        t(id);
        expect(errors).toEqual([]);
      });
    }
  }
});

describe('every message parses as valid ICU MessageFormat unless explicitly marked raw-only', () => {
  for (const [localeName, messages] of Object.entries(LOCALES)) {
    it(localeName, () => {
      const failures = leafPaths(messages)
        .filter((path) => !RAW_ONLY_KEYS.includes(path))
        .map((path) => {
          try {
            parse(get(messages, path) as string);
            return null;
          } catch (e) {
            return `${path}: ${(e as Error).message}`;
          }
        })
        .filter((f): f is string => f !== null);
      expect(failures).toEqual([]);
    });
  }
});
