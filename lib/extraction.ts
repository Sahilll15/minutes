import { z } from 'zod';
import { groundItem, indexSegments } from './citations.ts';
import { speakerName } from './transcript.ts';
import type { ActionItem, CitedItem, Extraction, Segment } from './types.ts';

const ids = z.array(z.string()).describe('Segment ids like "s4" that this item comes from.');
const quote = z.string().describe('A short verbatim excerpt (under 20 words) copied from one of the cited segments.');

const Cited = z.object({ text: z.string(), segment_ids: ids, quote });

export const ExtractionSchema = z.object({
  summary: z
    .array(z.object({ sentence: z.string(), segment_ids: ids }))
    .describe('Exactly 3 sentences summarizing the meeting.'),
  decisions: z.array(Cited),
  action_items: z.array(
    z.object({
      owner: z.string().nullable().describe('Person responsible, as named in the meeting. null if nobody took it.'),
      task: z.string(),
      due_date: z
        .string()
        .nullable()
        .describe('YYYY-MM-DD, resolved against the meeting date. null unless a date or day was actually said.'),
      due_phrase: z.string().nullable().describe('The words used for the deadline, e.g. "by Friday".'),
      segment_ids: ids,
      quote,
    }),
  ),
  open_questions: z.array(Cited),
  risks: z.array(Cited),
  follow_up_email: z.object({ subject: z.string(), body: z.string() }),
});

export type RawExtraction = z.infer<typeof ExtractionSchema>;

/** Straight quotes and no long dashes in anything we show or export. */
export function tidy(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .trim();
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Maps an owner name back to a diarization label when it matches a named speaker. */
export function matchSpeaker(owner: string | null, speakers: Record<string, string>, labels: string[]) {
  if (!owner) return null;
  const o = owner.trim().toLowerCase();
  const named = labels.map((label) => ({ label, name: speakerName(label, speakers).toLowerCase() }));
  const exact = named.find((n) => n.name === o);
  if (exact) return exact.label;
  const first = o.split(/\s+/)[0];
  const byFirst = named.filter((n) => !/^speaker [a-z]$/.test(n.name) && n.name.split(/\s+/)[0] === first);
  return byFirst.length === 1 ? byFirst[0].label : null;
}

/**
 * Turns model output into the stored shape: citations resolved against the real
 * segments, timestamps derived from them (never trusted from the model), dates validated.
 */
export function normalizeExtraction(
  raw: RawExtraction,
  segments: Segment[],
  speakers: Record<string, string>,
  model: string,
  now = Date.now(),
): Extraction {
  const index = indexSegments(segments);
  const labels = [...new Set(segments.map((s) => s.speaker))];
  let dropped = 0;

  const keep = <T extends CitedItem>(item: T) => {
    if (!item.text || item.segmentIds.length === 0) {
      dropped++;
      return false;
    }
    return true;
  };

  const cited = (prefix: string, list: RawExtraction['decisions']) =>
    list.map((r, i) => groundItem(`${prefix}${i + 1}`, tidy(r.text), r.segment_ids, r.quote, index)).filter(keep);

  const summary = raw.summary
    .slice(0, 3)
    .map((r, i) => groundItem(`sum${i + 1}`, tidy(r.sentence), r.segment_ids, '', index, true))
    .filter(keep);

  const actions: ActionItem[] = raw.action_items
    .map((r, i) => {
      const base = groundItem(`act${i + 1}`, tidy(r.task), r.segment_ids, r.quote, index);
      const owner = r.owner?.trim() || null;
      return {
        ...base,
        owner,
        ownerSpeaker: matchSpeaker(owner, speakers, labels),
        due: isIsoDate(r.due_date) ? r.due_date : null,
        duePhrase: r.due_phrase?.trim() || null,
      };
    })
    .filter(keep);

  return {
    summary,
    decisions: cited('dec', raw.decisions),
    actions,
    questions: cited('q', raw.open_questions),
    risks: cited('risk', raw.risks),
    email: { subject: tidy(raw.follow_up_email.subject).replace(/^(re|fwd?):\s*/i, ''), body: tidy(raw.follow_up_email.body) },
    dropped,
    model,
    createdAt: now,
  };
}

export function ownerName(a: ActionItem, speakers: Record<string, string>) {
  return a.ownerSpeaker ? speakerName(a.ownerSpeaker, speakers) : a.owner;
}
