import { describe, expect, it } from 'vitest';
import { buildContactsCsv } from './export-contacts-csv';

describe('buildContactsCsv', () => {
  it('writes the header and plain rows unquoted', () => {
    const csv = buildContactsCsv([
      { phone: '+15551234567', name: 'Alice', email: 'a@x.com', company: 'Acme', tagNames: ['VIP', 'Lead'] },
    ]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('phone,name,email,company,tags');
    expect(row).toBe('+15551234567,Alice,a@x.com,Acme,VIP; Lead');
  });

  it('quotes fields containing commas', () => {
    const csv = buildContactsCsv([
      { phone: '+1', name: 'Doe, Jane', email: null, company: null, tagNames: [] },
    ]);
    expect(csv.split('\r\n')[1]).toBe('+1,"Doe, Jane",,,');
  });

  it('escapes embedded quotes by doubling them', () => {
    const csv = buildContactsCsv([
      { phone: '+1', name: 'The "Boss"', email: null, company: null, tagNames: [] },
    ]);
    expect(csv.split('\r\n')[1]).toBe('+1,"The ""Boss""",,,');
  });

  it('quotes fields containing newlines', () => {
    const csv = buildContactsCsv([
      { phone: '+1', name: 'Line1\nLine2', email: null, company: null, tagNames: [] },
    ]);
    expect(csv.split('\r\n')[1]).toBe('+1,"Line1\nLine2",,,');
  });

  it('treats null/undefined optional fields as empty cells', () => {
    const csv = buildContactsCsv([
      { phone: '+1', name: undefined, email: undefined, company: undefined, tagNames: [] },
    ]);
    expect(csv.split('\r\n')[1]).toBe('+1,,,,');
  });
});
