import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  citedBy,
  groundItem,
  indexSegments,
  quoteSupport,
  resolveCitations,
  segmentAt,
} from './citations.ts';
import { matchSpeaker, normalizeExtraction, type RawExtraction } from './extraction.ts';
import { cleanText, normalizeSegments, transcriptForPrompt } from './transcript.ts';
import type { Segment } from './types.ts';

const segments: Segment[] = [
  { id: 's1', start: 0, end: 5.6, speaker: 'A', text: "Morning everyone, we have the billing launch on the fourteenth." },
  { id: 's2', start: 8.4, end: 18.9, speaker: 'B', text: 'The invoice service is merged. I should have the proration fix done by Wednesday.' },
  { id: 's3', start: 22.6, end: 31.0, speaker: 'B', text: "If proration is wrong customers get charged twice. I'd call it a launch risk." },
  { id: 's4', start: 48.1, end: 56.9, speaker: 'C', text: "We'll show monthly by default, with an annual toggle." },
];
const index = indexSegments(segments);

test('resolveCitations normalizes loose ids, drops unknown ones, keeps transcript order', () => {
  assert.deepEqual(resolveCitations(['S3', '[s01]', 'seg 3', 's9', 'nope', 's2'], index), ['s1', 's2', 's3']);
  assert.deepEqual(resolveCitations([], index), []);
});

test('quoteSupport measures how much of the quote is in the cited text', () => {
  assert.equal(quoteSupport('proration fix done by Wednesday', [segments[1]]), 1);
  assert.equal(quoteSupport('proration fix done by Wednesday', [segments[3]]), 0);
  assert.equal(quoteSupport('', [segments[1]]), 0);
});

test('groundItem derives the timestamp from the first cited segment, not the model', () => {
  const item = groundItem('act1', 'Fix proration', ['s3', 's2'], 'proration fix done by Wednesday', index);
  assert.deepEqual(item.segmentIds, ['s2', 's3']);
  assert.equal(item.at, 8.4);
  assert.equal(item.grounded, true);
});

test('groundItem flags a quote that does not appear in the cited segment', () => {
  const item = groundItem('dec1', 'Annual pricing by default', ['s4'], 'annual prices shown by default for enterprise', index);
  assert.equal(item.grounded, false);
  assert.ok(item.support < 0.6);
});

test('groundItem with no valid citations is ungrounded and has no timestamp', () => {
  const item = groundItem('q1', 'Something', ['s42'], 'anything', index);
  assert.deepEqual(item.segmentIds, []);
  assert.equal(item.at, null);
  assert.equal(item.grounded, false);
});

test('segmentAt finds the segment playing at a time', () => {
  assert.equal(segmentAt(segments, 0), 0);
  assert.equal(segmentAt(segments, 10), 1);
  assert.equal(segmentAt(segments, 20), 1);
  assert.equal(segmentAt(segments, 100), 3);
  assert.equal(segmentAt(segments, -1), -1);
});

test('normalizeSegments merges short same-speaker phrases into turns with stable ids', () => {
  const out = normalizeSegments([
    { start: 0.55, end: 5.6, speaker: 'A', text: ' everyone; quick stand-up.' },
    { start: 0, end: 0.4, speaker: 'A', text: ' Morning,' },
    { start: 6.2, end: 6.6, speaker: 'A', text: ' Marcus,' },
    { start: 8.4, end: 8.8, speaker: 'B', text: ' Sure.' },
    { start: 9.35, end: 11.4, speaker: 'B', text: '' },
    { start: 30, end: 31, speaker: 'B', text: 'Later.' },
  ]);
  assert.deepEqual(
    out.map((s) => [s.id, s.speaker, s.text]),
    [
      ['s1', 'A', 'Morning, everyone; quick stand-up. Marcus,'],
      ['s2', 'B', 'Sure.'],
      ['s3', 'B', 'Later.'],
    ],
  );
  assert.equal(out[0].start, 0);
  assert.equal(out[0].end, 6.6);
});

test('cleanText collapses spelled-out acronyms', () => {
  assert.equal(cleanText('our I_T_ team  owns  it'), 'our IT team owns it');
  assert.equal(cleanText('that old e r p system'), 'that old ERP system');
  assert.equal(cleanText('our i t team'), 'our IT team');
  assert.equal(cleanText('Am I a fan? I think so'), 'Am I a fan? I think so');
  assert.equal(cleanText('plan B is fine'), 'plan B is fine');
});

test('transcriptForPrompt uses renamed speakers and segment ids', () => {
  const text = transcriptForPrompt(segments.slice(0, 2), { A: 'Priya' });
  assert.equal(text.split('\n')[0], '[s1 00:00] Priya: Morning everyone, we have the billing launch on the fourteenth.');
  assert.match(text.split('\n')[1], /^\[s2 00:08\] Speaker B: /);
});

test('matchSpeaker links owners to renamed speakers so later renames follow', () => {
  const speakers = { A: 'Priya Shah', B: 'Marcus', C: '' };
  assert.equal(matchSpeaker('Marcus', speakers, ['A', 'B', 'C']), 'B');
  assert.equal(matchSpeaker('priya', speakers, ['A', 'B', 'C']), 'A');
  assert.equal(matchSpeaker('Speaker C', speakers, ['A', 'B', 'C']), 'C');
  assert.equal(matchSpeaker('Speaker D', speakers, ['A', 'B', 'C']), null);
  assert.equal(matchSpeaker('Finance team', speakers, ['A', 'B', 'C']), null);
});

const raw: RawExtraction = {
  summary: [
    { sentence: 'The team prepared the billing launch.', segment_ids: ['s1'] },
    { sentence: 'Proration is a risk.', segment_ids: ['s3'] },
    { sentence: 'Pricing shows monthly first.', segment_ids: ['s4'] },
    { sentence: 'An extra fourth sentence.', segment_ids: ['s1'] },
  ],
  decisions: [
    { text: 'Show monthly prices by default', segment_ids: ['s4'], quote: 'show monthly by default' },
    { text: 'Invented decision', segment_ids: ['s77'], quote: 'never said' },
  ],
  action_items: [
    {
      owner: 'Marcus',
      task: 'Fix the proration bug',
      due_date: '2026-10-07',
      due_phrase: 'by Wednesday',
      segment_ids: ['s2'],
      quote: 'proration fix done by Wednesday',
    },
    { owner: null, task: 'Bad date', due_date: '2026-02-30', due_phrase: null, segment_ids: ['s1'], quote: 'billing launch' },
  ],
  open_questions: [],
  risks: [{ text: 'Double charging', segment_ids: ['3'], quote: 'customers get charged twice' }],
  follow_up_email: { subject: ' Recap ', body: 'Hi all' },
};

test('normalizeExtraction drops uncited items, caps the summary, and validates dates', () => {
  const x = normalizeExtraction(raw, segments, { B: 'Marcus' }, 'test-model', 1);
  assert.equal(x.summary.length, 3);
  assert.equal(x.decisions.length, 1);
  assert.equal(x.dropped, 1);
  assert.equal(x.actions[0].ownerSpeaker, 'B');
  assert.equal(x.actions[0].due, '2026-10-07');
  assert.equal(x.actions[0].at, 8.4);
  assert.equal(x.actions[1].due, null);
  assert.deepEqual(x.risks[0].segmentIds, ['s3']);
  assert.equal(x.email.subject, 'Recap');
});

test('summary sentences are grounded by citation alone, and text is tidied', async () => {
  const { tidy } = await import('./extraction.ts');
  const x = normalizeExtraction(raw, segments, {}, 'test-model', 1);
  assert.ok(x.summary.every((s) => s.grounded));
  assert.equal(tidy('It\u2019s done \u2014 \u201Cfinal\u201D'), 'It\'s done, "final"');
  assert.equal(normalizeExtraction({ ...raw, follow_up_email: { subject: 'Re: Recap', body: 'x' } }, segments, {}, 'm', 1).email.subject, 'Recap');
});

test('citedBy maps each segment back to the items that cite it', () => {
  const x = normalizeExtraction(raw, segments, {}, 'test-model', 1);
  const map = citedBy(x);
  assert.deepEqual(
    map.get('s3')?.map((e) => e.id),
    ['sum2', 'risk1'],
  );
  assert.equal(map.has('s99'), false);
});

test('quoteRange marks the quoted phrase inside a segment despite punctuation drift', async () => {
  const { quoteRange } = await import('./citations.ts');
  const text = "If proration is wrong, customers get charged twice. So yes.";
  const r = quoteRange(text, 'customers get charged twice');
  assert.deepEqual(r && text.slice(r[0], r[1]), 'customers get charged twice.');
  assert.equal(quoteRange(text, 'nothing like this at all'), null);
  assert.equal(quoteRange(text, ''), null);
});
