import { ownerName } from './extraction.ts';
import { formatTime, speakerName } from './transcript.ts';
import type { CitedItem, Meeting } from './types.ts';

function cite(item: CitedItem) {
  return item.at != null ? ` [${formatTime(item.at)}]` : '';
}

export function toMarkdown(m: Meeting) {
  const x = m.extraction;
  const people = [...new Set(m.segments.map((s) => s.speaker))].map((l) => speakerName(l, m.speakers));
  const out = [`# ${m.title}`, '', `${m.date} · ${formatTime(m.duration)} · ${people.join(', ')}`, ''];
  if (x) {
    out.push('## Summary', '', x.summary.map((s) => s.text).join(' '), '');
    const section = (title: string, items: CitedItem[]) => {
      if (!items.length) return;
      out.push(`## ${title}`, '', ...items.map((i) => `- ${i.text}${cite(i)}`), '');
    };
    section('Decisions', x.decisions);
    if (x.actions.length) {
      out.push('## Action items', '');
      for (const a of x.actions) {
        const owner = ownerName(a, m.speakers);
        const due = a.due ? ` (due ${a.due})` : a.duePhrase ? ` (${a.duePhrase})` : '';
        const box = m.done.includes(a.id) ? '[x]' : '[ ]';
        out.push(`- ${box} ${owner ? `**${owner}**: ` : ''}${a.text}${due}${cite(a)}`);
      }
      out.push('');
    }
    section('Open questions', x.questions);
    section('Risks', x.risks);
  }
  out.push('## Transcript', '');
  for (const s of m.segments) out.push(`**${speakerName(s.speaker, m.speakers)}** [${formatTime(s.start)}]: ${s.text}`, '');
  return out.join('\n').trimEnd() + '\n';
}
