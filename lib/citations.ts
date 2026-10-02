import type { ActionItem, CitedItem, Extraction, Segment, SectionKey } from './types.ts';

/** Below this share of quote words found in the cited segments, the UI flags the item. */
export const SUPPORT_THRESHOLD = 0.6;

const STOP = new Set(
  'a an and are as at be but by for from has have i if in is it its of on or so that the their them then there they this to was we were will with you'.split(' '),
);

export function indexSegments(segments: Segment[]) {
  return new Map(segments.map((s, i) => [s.id, { segment: s, order: i }]));
}

type Index = ReturnType<typeof indexSegments>;

/** Accepts the loose forms models produce ("S3", "[s03]", "seg 3") and returns known ids in transcript order. */
export function resolveCitations(ids: readonly string[], index: Index): string[] {
  const out = new Set<string>();
  for (const raw of ids) {
    const m = /(\d+)/.exec(String(raw));
    if (!m) continue;
    const id = `s${Number(m[1])}`;
    if (index.has(id)) out.add(id);
  }
  return [...out].sort((a, b) => index.get(a)!.order - index.get(b)!.order);
}

export function words(text: string) {
  return (text.toLowerCase().normalize('NFKD').match(/[a-z0-9']+/g) ?? [])
    .map((w) => w.replace(/'/g, ''))
    .filter((w) => w && !STOP.has(w));
}

/** Recall of the quote's content words inside the cited segments' text. */
export function quoteSupport(quote: string, cited: Segment[]) {
  const q = words(quote);
  if (!q.length) return 0;
  const pool = new Set(cited.flatMap((s) => words(s.text)));
  return q.filter((w) => pool.has(w)).length / q.length;
}

export function groundItem(
  id: string,
  text: string,
  rawIds: readonly string[],
  quote: string,
  index: Index,
  paraphrase = false,
): CitedItem {
  const segmentIds = resolveCitations(rawIds, index);
  const cited = segmentIds.map((s) => index.get(s)!.segment);
  // An empty quote falls back to the item text so paraphrased items still get scored.
  const support = segmentIds.length ? quoteSupport(quote || text, cited) : 0;
  return {
    id,
    text: text.trim(),
    segmentIds,
    quote: quote.trim(),
    support: Math.round(support * 100) / 100,
    // Summary sentences paraphrase by design, so only their citations are required.
    grounded: segmentIds.length > 0 && (paraphrase || support >= SUPPORT_THRESHOLD),
    at: cited.length ? cited[0].start : null,
  };
}

export const SECTIONS: SectionKey[] = ['summary', 'decisions', 'actions', 'questions', 'risks'];

export function allItems(x: Extraction): { section: SectionKey; item: CitedItem | ActionItem }[] {
  return SECTIONS.flatMap((section) => x[section].map((item) => ({ section, item })));
}

/** Reverse map used by the transcript to show which items cite each segment. */
export function citedBy(x: Extraction) {
  const map = new Map<string, { section: SectionKey; id: string }[]>();
  for (const { section, item } of allItems(x)) {
    for (const sid of item.segmentIds) {
      const list = map.get(sid) ?? [];
      list.push({ section, id: item.id });
      map.set(sid, list);
    }
  }
  return map;
}

export function findItem(x: Extraction, id: string) {
  return allItems(x).find((e) => e.item.id === id)?.item ?? null;
}

/** Index of the segment playing at `time`, or the last one that started before it. */
export function segmentAt(segments: Segment[], time: number) {
  let lo = 0;
  let hi = segments.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function groundingStats(x: Extraction) {
  const items = allItems(x).map((e) => e.item);
  const grounded = items.filter((i) => i.grounded).length;
  return { total: items.length, grounded, weak: items.length - grounded };
}

/**
 * Character range in `text` covering the longest in-order run of the quote's words,
 * so the UI can mark the exact phrase. Returns null when fewer than 3 words line up.
 */
export function quoteRange(text: string, quote: string): [number, number] | null {
  const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokens = [...text.matchAll(/\S+/g)].map((m) => ({ w: norm(m[0]), from: m.index, to: m.index + m[0].length }));
  const q = (quote.match(/\S+/g) ?? []).map(norm).filter(Boolean);
  if (!q.length || !tokens.length) return null;
  let best: [number, number, number] | null = null;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < q.length; j++) {
      let k = 0;
      while (i + k < tokens.length && j + k < q.length && tokens[i + k].w === q[j + k]) k++;
      if (k && (!best || k > best[2])) best = [i, i + k - 1, k];
    }
  }
  if (!best || best[2] < Math.min(3, q.length)) return null;
  return [tokens[best[0]].from, tokens[best[1]].to];
}
