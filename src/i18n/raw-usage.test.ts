import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8');

// next-intl's t() runs its value through the ICU MessageFormat parser.
// Keys whose content is literal "{{n}}" example syntax or an HTML tag with
// an inline attribute are not valid ICU and must be read with t.raw()
// (which returns the string unparsed) instead of t(). See messages.test.ts
// for the full list and why each key is unsafe for plain t().
function expectReadViaRaw(source: string, key: string) {
  const rawCall = new RegExp(`t\\.raw\\((['"])${key}\\1\\)`);
  const plainCall = new RegExp(`[^.]t\\((['"])${key}\\1\\)`);
  expect(source).toMatch(rawCall);
  expect(source).not.toMatch(plainCall);
}

describe('whatsapp-config.tsx reads tag-bearing keys via t.raw()', () => {
  const source = read('src/components/settings/whatsapp-config.tsx');
  for (const key of ['pinHint', 'step1_1', 'step3_2', 'step3_3', 'step3_4', 'step4_3', 'step4_4']) {
    it(key, () => expectReadViaRaw(source, key));
  }
});

describe('template-manager.tsx reads literal-placeholder keys via t.raw()', () => {
  const source = read('src/components/settings/template-manager.tsx');
  for (const key of [
    'headerTextPlaceholder',
    'headerSamplePlaceholder',
    'bodyPlaceholder',
    'bodyHint',
    'urlPlaceholder',
    'urlSamplePlaceholder',
  ]) {
    it(key, () => expectReadViaRaw(source, key));
  }
});

describe('automation-builder.tsx reads config.placeholderValue via t.raw()', () => {
  const source = read('src/components/automations/automation-builder.tsx');
  it('config.placeholderValue', () => expectReadViaRaw(source, 'config\\.placeholderValue'));
});

describe('settings-overview.tsx uses the correct Settings.roles namespace', () => {
  const source = read('src/components/settings/settings-overview.tsx');
  it("does not call useTranslations('roles')", () => {
    expect(source).not.toMatch(/useTranslations\((['"])roles\1\)/);
  });
  it("calls useTranslations('Settings.roles')", () => {
    expect(source).toMatch(/useTranslations\((['"])Settings\.roles\1\)/);
  });
});
