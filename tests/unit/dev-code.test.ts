import { describe, expect, it } from 'vitest';
import { runRegex, MAX_MATCHES } from '../../src/dev/lib/regex-match';
import { nextRuns, parseCron, type Cron } from '../../src/dev/lib/cron';
import { run as cronRun } from '../../src/dev/run/cron-expression-parser';
import { run as sqlRun } from '../../src/dev/run/sql-formatter';
import { formatXml } from '../../src/dev/lib/xml';
import { prefixOf, subnet } from '../../src/dev/run/subnet-calculator';

describe('regex', () => {
  it('finds every match with g, with groups and named groups', () => {
    const r = runRegex('(?<user>\\w+)@(\\w+)\\.com', 'g', 'ada@x.com, bo@y.com') as Exclude<ReturnType<typeof runRegex>, { error: string }>;
    expect(r.count).toBe(2);
    expect(r.segments).toEqual([{ text: 'ada@x.com', match: true }, { text: ', ' }, { text: 'bo@y.com', match: true }]);
    expect(r.rows.slice(0, 4)).toEqual([['Match 1, at 0', 'ada@x.com'], ['  Group 1', 'ada'], ['  Group 2', 'x'], ['  Group “user”', 'ada']]);
  });
  it('stops at the first match without g, and steps past empty matches', () => {
    expect((runRegex('a', '', 'aaa') as { count: number }).count).toBe(1);
    expect((runRegex('x*', 'g', 'ab') as { count: number }).count).toBe(3);
    expect((runRegex('', 'gu', '😀😀') as { count: number }).count).toBe(3);
  });
  it('caps the matches and explains a bad pattern', () => {
    expect(runRegex('.', 'g', 'x'.repeat(MAX_MATCHES + 5))).toMatchObject({ count: MAX_MATCHES, capped: true });
    expect(runRegex('(', 'g', 'x')).toEqual({ error: expect.stringMatching(/^Invalid pattern: /) });
    expect(runRegex('a', 'gq', 'x')).toEqual({ error: expect.stringMatching(/^Invalid pattern: /) });
  });
});

describe('cron', () => {
  const at = (s: string) => {
    const [d, t] = s.split(' ');
    const [y, mo, day] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    return new Date(y, mo - 1, day, h, mi);
  };
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const next = (expr: string, from: string, n = 3) => nextRuns(parseCron(expr) as Cron, at(from), n).map(fmt);

  it('steps, ranges and weekdays (Friday 2025-01-03 17:50 → next Monday)', () => {
    expect(next('*/15 9-17 * * 1-5', '2025-01-03 17:50')).toEqual(['2025-01-06 09:00', '2025-01-06 09:15', '2025-01-06 09:30']);
  });
  it('names, lists, aliases and Sunday as 7', () => {
    expect(next('0 12 1,15 JAN,feb *', '2025-01-10 00:00')).toEqual(['2025-01-15 12:00', '2025-02-01 12:00', '2025-02-15 12:00']);
    expect(next('@weekly', '2025-01-01 00:00', 1)).toEqual(['2025-01-05 00:00']);
    expect(next('0 0 * * 7', '2025-01-01 00:00', 1)).toEqual(['2025-01-05 00:00']);
  });
  it('runs on either restricted day field (OR), as cron does', () => {
    expect(next('0 0 13 * 5', '2025-06-01 00:00', 3)).toEqual(['2025-06-06 00:00', '2025-06-13 00:00', '2025-06-20 00:00']);
  });
  it('handles leap days and schedules that never come round', () => {
    expect(next('0 0 29 2 *', '2025-01-01 00:00', 1)).toEqual(['2028-02-29 00:00']);
    expect(next('0 0 30 2 *', '2025-01-01 00:00', 1)).toEqual([]);
  });
  it('explains bad fields', () => {
    expect(parseCron('* * *')).toEqual({ error: 'A cron expression has 5 fields (minute hour day month weekday); this one has 3.' });
    expect(parseCron('61 * * * *')).toEqual({ error: '“61” is out of range for the minute (0–59).' });
    expect(parseCron('* * * * mon-xyz')).toEqual({ error: '“mon-xyz” is out of range for the day of week (0–7).' });
  });
  it('describes the schedule in plain English', async () => {
    const r = await cronRun({ expr: '*/15 9-17 * * 1-5' });
    expect(r.out!.meaning).toBe('Every 15 minutes, between 09:00 and 17:59, Monday through Friday.');
    expect((r.out!.next as { rows: unknown[] }).rows).toHaveLength(5);
    expect((await cronRun({ expr: '@reboot' })).out!.meaning).toBe('At system startup.');
  });
});

describe('sql formatter', () => {
  it('formats with the chosen keyword case', async () => {
    expect((await sqlRun({ text: 'select id, name from users where active = 1', dialect: 'sql', case: 'upper' })).out!.result).toBe(
      'SELECT\n  id,\n  name\nFROM\n  users\nWHERE\n  active = 1',
    );
    expect((await sqlRun({ text: 'SELECT 1', dialect: 'postgresql', case: 'lower' })).out!.result).toBe('select\n  1');
  });
  it('reports what the formatter cannot parse', async () => {
    expect((await sqlRun({ text: 'select "unclosed', dialect: 'sql', case: 'upper' })).error).toMatch(/^Can’t format this SQL: /);
  });
});

describe('xml formatter', () => {
  it('indents nested elements and keeps text-only elements on one line', () => {
    expect(formatXml('<?xml version="1.0"?><note><to>Ada</to><empty/><body>Hi <![CDATA[<x>]]></body><!-- c --></note>', '  ')).toBe(
      '<?xml version="1.0"?>\n<note>\n  <to>Ada</to>\n  <empty/>\n  <body>\n    Hi\n    <![CDATA[<x>]]>\n  </body>\n  <!-- c -->\n</note>',
    );
    expect(formatXml('<a>\n   <b></b>\n</a>', '\t')).toBe('<a>\n\t<b></b>\n</a>');
  });
});

describe('subnet calculator', () => {
  const rows = (s: string) => Object.fromEntries(subnet(s) as [string, string][]);
  it('works out a /24 from any address in it', () => {
    expect(rows('192.168.1.10/24')).toEqual({
      Network: '192.168.1.0/24', Netmask: '255.255.255.0', 'Wildcard mask': '0.0.0.255', Broadcast: '192.168.1.255',
      'First host': '192.168.1.1', 'Last host': '192.168.1.254', 'Usable hosts': '254', 'Total addresses': '256', Type: 'Private (RFC 1918)',
    });
  });
  it('takes a netmask, and handles /31, /32 and /0', () => {
    expect(rows('10.0.0.1 255.255.252.0').Network).toBe('10.0.0.0/22');
    expect(rows('10.0.0.1/31')).toMatchObject({ 'Usable hosts': '2', 'First host': '10.0.0.0', 'Last host': '10.0.0.1', Broadcast: '(none)' });
    expect(rows('8.8.8.8/32')).toMatchObject({ 'Usable hosts': '1', Type: 'Public' });
    expect(rows('0.0.0.0/0')['Total addresses']).toBe('4,294,967,296');
  });
  it('rejects bad addresses, prefixes and non-contiguous masks', () => {
    expect(subnet('300.1.1.1/24')).toMatch(/not an IPv4 address/);
    expect(subnet('1.1.1.1/33')).toBe('The prefix must be between /0 and /32.');
    expect(subnet('1.1.1.1 255.0.255.0')).toMatch(/not a valid netmask/);
    expect(subnet('1.1.1.1')).toBe('Add a prefix such as /24, or a netmask after the address.');
    expect(prefixOf(0xffffff00)).toBe(24);
  });
});
