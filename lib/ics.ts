import { formatTime } from './transcript.ts';

export type IcsTask = {
  id: string;
  task: string;
  due: string | null;
  owner: string | null;
  at: number | null;
  quote: string;
};

export function escapeText(v: string) {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 folding: lines over 75 octets continue on the next line after CRLF + space. */
export function foldLine(line: string) {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function ymd(iso: string) {
  return iso.replace(/-/g, '');
}

function nextDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function stamp(now: Date) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** All-day events, one per action item that has a due date. Returns null when none do. */
export function buildIcs(
  tasks: IcsTask[],
  meeting: { id: string; title: string; date: string },
  now = new Date(),
) {
  const dated = tasks.filter((t) => t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due));
  if (!dated.length) return null;

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minutes//Action items//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const t of dated) {
    const due = t.due!;
    const desc = [
      t.owner ? `Owner: ${t.owner}` : 'Owner: unassigned',
      `From "${meeting.title}" on ${meeting.date}${t.at != null ? ` at ${formatTime(t.at)}` : ''}`,
      t.quote ? `Said: "${t.quote}"` : '',
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${meeting.id}-${t.id}@minutes.app`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${ymd(due)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(due))}`,
      `SUMMARY:${escapeText(t.owner ? `${t.task.replace(/\.$/, '')} (${t.owner})` : t.task)}`,
      `DESCRIPTION:${escapeText(desc)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
