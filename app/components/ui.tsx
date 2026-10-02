import type { ReactNode, SVGProps } from 'react';
import type { MeetingStatus } from '@/lib/types';

const PATHS: Record<string, ReactNode> = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  upload: <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="m15 18-6-6 6-6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  download: <path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  sparkle: <path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9Z" />,
  trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 0 0-14.7-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.7 4.3l1.3-1.8M20 20v-4.5h-4.5" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  file: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  quote: <path d="M9 7H5.5v5H9c0 2-1 3.5-3 4M18.5 7H15v5h3.5c0 2-1 3.5-3 4" />,
  flag: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01" />
    </>
  ),
  home: <path d="M4 11 12 4l8 7v8a1.5 1.5 0 0 1-1.5 1.5H15V15h-6v5.5H5.5A1.5 1.5 0 0 1 4 19Z" />,
  wave: <path d="M3 12h2m3-5v10m4-13v16m4-11v6m4-3h1" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

const TONES = [
  ['#ffe3d3', '#9a3d12'],
  ['#dfe7ff', '#2d43a8'],
  ['#dcf3e6', '#17643a'],
  ['#f3e1ff', '#6b2aa0'],
  ['#fff0c2', '#80580a'],
  ['#d8f1f6', '#11606f'],
];

export function toneFor(key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function initials(name: string) {
  const parts = name.replace(/^Speaker\s+/i, '').trim().split(/\s+/);
  if (!parts[0]) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0][0]).toUpperCase();
}

export function Avatar({ label, name, size = 28, ring = true }: { label: string; name: string; size?: number; ring?: boolean }) {
  const [bg, fg] = toneFor(label);
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold ${ring ? 'ring-2 ring-white' : ''}`}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.38) }}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 3, size = 26 }: { people: { label: string; name: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="flex items-center -space-x-2" aria-label={people.map((p) => p.name).join(', ')}>
      {shown.map((p) => (
        <Avatar key={p.label} label={p.label} name={p.name} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-soft text-[11px] font-bold text-ink-soft ring-2 ring-white"
          style={{ width: size, height: size }}
        >
          {extra}+
        </span>
      )}
    </span>
  );
}

const STATUS: Record<MeetingStatus, { label: string; cls: string }> = {
  transcribing: { label: 'Transcribing', cls: 'bg-lav-bg text-lav' },
  naming: { label: 'Name speakers', cls: 'bg-amber-bg text-amber' },
  extracting: { label: 'Extracting', cls: 'bg-lav-bg text-lav' },
  ready: { label: 'Ready', cls: 'bg-mint-bg text-mint' },
  error: { label: 'Needs retry', cls: 'bg-red-bg text-red' },
};

export function StatusBadge({ status }: { status: MeetingStatus }) {
  const s = STATUS[status];
  const busy = status === 'transcribing' || status === 'extracting';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>
      {busy && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {s.label}
    </span>
  );
}

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
  soft:
    'inline-flex items-center justify-center gap-2 rounded-full bg-soft px-4 py-2 text-sm font-semibold text-ink transition hover:bg-soft-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
  ghost:
    'inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-line-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
  icon:
    'inline-flex size-10 items-center justify-center rounded-full border border-line bg-white text-ink transition hover:border-line-strong active:scale-95',
};
