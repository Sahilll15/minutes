import type { Segment } from './types.ts';

export type RawSegment = { start: number; end: number; speaker: string; text: string };

/** Whisper returns timed segments without speakers, so all of them share label A. */
export function undiarized(segments: { start: number; end: number; text: string }[]): RawSegment[] {
  return segments.map(({ start, end, text }) => ({ start, end, text, speaker: 'A' }));
}

const MAX_GAP = 1.2;
const MAX_TURN = 15;
const MAX_CHARS = 320;

/** Joins acronyms the model spells out ("I_T_", "e r p") and normalizes whitespace and dashes. */
export function cleanText(text: string) {
  return text
    .replace(/\b((?:[A-Za-z]_){2,})/g, (m) => m.replace(/_/g, '').toUpperCase())
    .replace(/\b[b-zB-Z](?: [b-zB-Z]){1,4}\b(?![''])/g, (m) => (/^(?:I ?)+$/.test(m) ? m : m.replace(/ /g, '').toUpperCase()))
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Diarized output arrives as many short phrases. Merge consecutive phrases from
 * the same speaker into readable turns, then give each turn a stable id (s1, s2, ...).
 */
export function normalizeSegments(raw: RawSegment[]): Segment[] {
  const sorted = raw
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && cleanText(s.text))
    .map((s) => ({ ...s, start: Math.max(0, s.start), end: Math.max(s.start, s.end) }))
    .sort((a, b) => a.start - b.start);

  const turns: Omit<Segment, 'id'>[] = [];
  for (const s of sorted) {
    const text = cleanText(s.text);
    const speaker = String(s.speaker || '?').trim() || '?';
    const last = turns.at(-1);
    if (
      last &&
      last.speaker === speaker &&
      s.start - last.end <= MAX_GAP &&
      s.end - last.start <= MAX_TURN &&
      last.text.length + text.length < MAX_CHARS
    ) {
      last.end = Math.max(last.end, s.end);
      last.text = `${last.text} ${text}`;
    } else {
      turns.push({ start: s.start, end: s.end, speaker, text });
    }
  }
  return turns.map((t, i) => ({
    id: `s${i + 1}`,
    start: round(t.start),
    end: round(t.end),
    speaker: t.speaker,
    text: t.text,
  }));
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function speakerLabels(segments: Segment[]) {
  return [...new Set(segments.map((s) => s.speaker))];
}

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}

/** Diarization labels are letters (A, B) unless known-speaker references supplied real names. */
export function speakerName(label: string, speakers: Record<string, string>) {
  return speakers[label]?.trim() || (/^[A-Z]$/.test(label) ? `Speaker ${label}` : label);
}

/** One line per segment, in the shape the extraction prompt cites from. */
export function transcriptForPrompt(segments: Segment[], speakers: Record<string, string>) {
  return segments
    .map((s) => `[${s.id} ${formatTime(s.start)}] ${speakerName(s.speaker, speakers)}: ${s.text}`)
    .join('\n');
}
