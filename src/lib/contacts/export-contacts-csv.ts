/**
 * CSV building for contact export. Deliberately separate from
 * `parse-contact-csv.ts` (the import parser): import tolerates a loose,
 * hand-rolled split since it only ever reads files this app produced or a
 * simple template, but export produces a file that may be re-imported or
 * opened in Excel/Sheets, so it needs correct RFC 4180 quoting — any
 * contact name/company containing a comma, quote, or newline must not
 * corrupt the file.
 */

export interface ExportableContact {
  phone: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  /** Tag *names* (not ids) — already resolved by the caller. */
  tagNames: string[];
}

const HEADER = ['phone', 'name', 'email', 'company', 'tags'] as const;

/** Quote a single CSV field per RFC 4180 (only when necessary). */
function csvField(value: string | null | undefined): string {
  const s = value ?? '';
  if (/["\n\r,]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string (header + rows) from contacts. Tag names are joined
 * with `; ` inside a single quoted cell — matching the separators the
 * import parser (`parseTagCell`) already accepts, so an exported file can
 * be re-imported unchanged.
 */
export function buildContactsCsv(contacts: ExportableContact[]): string {
  const lines = [HEADER.join(',')];

  for (const c of contacts) {
    const tags = c.tagNames.join('; ');
    lines.push(
      [
        csvField(c.phone),
        csvField(c.name),
        csvField(c.email),
        csvField(c.company),
        csvField(tags),
      ].join(',')
    );
  }

  // CRLF is the RFC 4180 line ending and what Excel expects on Windows.
  return lines.join('\r\n');
}

/** Trigger a browser download of the given CSV text. */
export function downloadCsv(csv: string, filename: string): void {
  // Leading BOM so Excel on Windows detects UTF-8 instead of guessing a
  // local codepage and mangling accented characters (common in
  // Brazilian-Portuguese contact names).
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
