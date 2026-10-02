import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, escapeText, foldLine } from './ics.ts';

const meeting = { id: 'm1', title: 'Product standup', date: '2026-10-05' };
const now = new Date('2026-10-05T09:30:00.123Z');

test('returns null when no action item has a due date', () => {
  assert.equal(buildIcs([{ id: 'a', task: 'x', due: null, owner: null, at: null, quote: '' }], meeting, now), null);
  assert.equal(buildIcs([], meeting, now), null);
});

test('builds one all-day VEVENT per dated task with CRLF line endings', () => {
  const ics = buildIcs(
    [
      { id: 'act1', task: 'Fix proration', due: '2026-10-07', owner: 'Marcus', at: 16.3, quote: 'done by Wednesday' },
      { id: 'act2', task: 'No date', due: null, owner: null, at: null, quote: '' },
      { id: 'act3', task: 'Year end', due: '2026-12-31', owner: null, at: null, quote: '' },
    ],
    meeting,
    now,
  )!;
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 2);
  assert.ok(!/[^\r]\n/.test(ics), 'every newline is CRLF');
  assert.match(ics, /DTSTART;VALUE=DATE:20261007\r\nDTEND;VALUE=DATE:20261008/);
  assert.match(ics, /DTEND;VALUE=DATE:20270101/);
  assert.match(ics, /UID:m1-act1@minutes\.app/);
  assert.match(ics, /DTSTAMP:20261005T093000Z/);
  assert.match(ics, /SUMMARY:Fix proration \(Marcus\)/);
  assert.match(ics, /Owner: unassigned/);
});

test('escapes commas, semicolons, backslashes and newlines', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('folds long lines at 75 octets without splitting multibyte characters', () => {
  const line = 'DESCRIPTION:' + 'é'.repeat(80);
  const folded = foldLine(line);
  const parts = folded.split('\r\n ');
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75);
  assert.equal(parts.join(''), line);
  assert.equal(foldLine('SHORT'), 'SHORT');
});

test('a long task title survives escaping and folding intact', () => {
  const task = 'Write the migration script for existing customers, including annual plans; then hand it to finance';
  const ics = buildIcs([{ id: 'a', task, due: '2026-10-12', owner: null, at: 0, quote: '' }], meeting, now)!;
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes(`SUMMARY:${escapeText(task)}`));
  for (const l of ics.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75);
});
