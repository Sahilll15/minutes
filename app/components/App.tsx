'use client';

import { useMemo, useState } from 'react';
import type { Sample } from '@/lib/samples';
import { formatTime, speakerName } from '@/lib/transcript';
import type { Meeting, MeetingSource } from '@/lib/types';
import { Composer } from './Composer';
import { MeetingView } from './MeetingView';
import { transcribe } from './pipeline';
import { meetingsStore, saveAudio, useMeetings } from './store';
import { AvatarStack, btn, Icon, type IconName, StatusBadge } from './ui';

type Tab = 'all' | MeetingSource;
const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'all', label: 'All', icon: 'grid' },
  { key: 'recorded', label: 'Recorded', icon: 'mic' },
  { key: 'uploaded', label: 'Uploaded', icon: 'upload' },
  { key: 'sample', label: 'Samples', icon: 'sparkle' },
];

function newId() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function people(m: Meeting) {
  return [...new Set(m.segments.map((s) => s.speaker))].map((label) => ({ label, name: speakerName(label, m.speakers) }));
}

function matches(m: Meeting, q: string) {
  if (!q) return true;
  const hay = [
    m.title,
    ...Object.values(m.speakers),
    ...(m.extraction ? [...m.extraction.summary, ...m.extraction.decisions, ...m.extraction.actions].map((i) => i.text) : []),
  ]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

export default function App() {
  const meetings = useMeetings();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [mobileDetail, setMobileDetail] = useState(false);

  const current = meetings.find((m) => m.id === selected) ?? null;
  const visible = useMemo(() => meetings.filter((m) => (tab === 'all' || m.source === tab) && matches(m, query.trim())), [meetings, tab, query]);

  const stats = useMemo(() => {
    let open = 0;
    let decisions = 0;
    for (const m of meetings) {
      if (!m.extraction) continue;
      open += m.extraction.actions.filter((a) => !m.done.includes(a.id)).length;
      decisions += m.extraction.decisions.length;
    }
    return { open, decisions };
  }, [meetings]);

  function open(id: string | null) {
    setSelected(id);
    setMobileDetail(true);
    window.scrollTo({ top: 0 });
  }

  function create(input: { title: string; date: string; blob: Blob; source: 'recorded' | 'uploaded'; duration: number }) {
    const id = newId();
    meetingsStore.add({
      id,
      title: input.title,
      date: input.date,
      createdAt: Date.now(),
      source: input.source,
      duration: input.duration,
      status: 'transcribing',
      speakers: {},
      segments: [],
      done: [],
    });
    void saveAudio(id, input.blob);
    open(id);
    void transcribe(id, input.blob);
  }

  function runSample(s: Sample) {
    const id = newId();
    meetingsStore.add({
      id,
      title: s.title,
      date: s.date,
      createdAt: Date.now(),
      source: 'sample',
      sampleId: s.id,
      audioUrl: s.audioUrl,
      duration: s.seconds,
      status: 'transcribing',
      speakers: {},
      segments: [],
      done: [],
    });
    open(id);
    void transcribe(id);
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={() => open(null)} className="flex items-center gap-2.5 rounded-full" aria-label="Minutes, new meeting">
            <Logo />
            <span className="text-[17px] font-extrabold tracking-tight">Minutes</span>
          </button>
          <label className="relative ml-auto hidden max-w-md flex-1 md:block">
            <span className="sr-only">Search meetings</span>
            <Icon name="search" size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search meetings, people, decisions"
              className="w-full rounded-full border border-line bg-soft py-2.5 pr-4 pl-11 text-sm outline-none transition placeholder:text-ink-faint focus:border-ink focus:bg-white"
            />
          </label>
          <button type="button" onClick={() => open(null)} className={`${btn.primary} ml-auto md:ml-0`}>
            <Icon name="plus" size={16} /> <span className="hidden sm:inline">New meeting</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside
          className={`${mobileDetail ? 'hidden' : 'block'} min-h-[calc(100dvh-64px)] border-line bg-white pb-28 lg:sticky lg:top-16 lg:block lg:h-[calc(100dvh-64px)] lg:min-h-0 lg:overflow-y-auto lg:border-r lg:pb-6 thin-scroll`}
          aria-label="Meetings"
        >
          <div className="space-y-4 p-4 sm:px-6 lg:px-4">
            <div>
              <p className="text-sm font-semibold text-ink-faint">Your meetings</p>
              <p className="text-[22px] font-extrabold tracking-tight">{meetings.length ? 'Pick up where you left off' : 'Nothing here yet'}</p>
            </div>

            <label className="relative block md:hidden">
              <span className="sr-only">Search meetings</span>
              <Icon name="search" size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search meetings"
                className="w-full rounded-full border border-line bg-white py-2.5 pr-4 pl-11 text-sm outline-none focus:border-ink"
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <StatTile dark value={meetings.length} label="Meetings" icon="calendar" />
              <StatTile value={stats.open} label="Open actions" icon="check" />
              <StatTile value={stats.decisions} label="Decisions" icon="flag" />
            </div>

            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="Filter meetings">
              {TABS.map((t) => {
                const count = t.key === 'all' ? meetings.length : meetings.filter((m) => m.source === t.key).length;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition ${
                      tab === t.key ? 'bg-ink text-white' : 'bg-soft text-ink-soft hover:bg-soft-strong'
                    }`}
                  >
                    {tab === t.key && <Icon name={t.icon} size={14} />}
                    {t.label}
                    {tab === t.key && count > 0 && <span className="text-white/60">{count}</span>}
                  </button>
                );
              })}
            </div>

            {visible.length ? (
              <ul className="space-y-2.5">
                {visible.map((m) => (
                  <li key={m.id}>
                    <MeetingCard m={m} selected={m.id === selected} onOpen={() => open(m.id)} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyList filtered={meetings.length > 0} onNew={() => open(null)} />
            )}
          </div>
        </aside>

        <main className={`${mobileDetail ? 'block' : 'hidden'} min-w-0 pb-28 lg:block lg:pb-0`}>
          {current ? (
            <MeetingView key={current.id} meeting={current} onBack={() => setMobileDetail(false)} />
          ) : (
            <Composer onCreate={create} onSample={runSample} />
          )}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-4 z-40 flex justify-center lg:hidden" aria-label="Primary">
        <div className="flex items-center gap-1.5 rounded-full bg-white/95 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] ring-1 ring-line backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileDetail(false)}
            className={`flex size-12 items-center justify-center rounded-full transition ${!mobileDetail ? 'bg-ink text-white' : 'bg-soft text-ink'}`}
            aria-label="Meetings"
          >
            <Icon name="home" size={20} />
          </button>
          <button
            type="button"
            onClick={() => open(null)}
            className={`flex size-12 items-center justify-center rounded-full transition ${mobileDetail && !current ? 'bg-ink text-white' : 'bg-soft text-ink'}`}
            aria-label="New meeting"
          >
            <Icon name="mic" size={20} />
          </button>
          {current && (
            <button
              type="button"
              onClick={() => setMobileDetail(true)}
              className={`flex size-12 items-center justify-center rounded-full transition ${mobileDetail ? 'bg-ink text-white' : 'bg-soft text-ink'}`}
              aria-label={`Open ${current.title}`}
            >
              <Icon name="file" size={20} />
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}

function Logo() {
  return (
    <span className="flex size-9 items-center justify-center rounded-[12px] bg-ink" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M5 15V9m4.5 9V6m4.5 10V8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="18.5" cy="8" r="2.3" fill="#f5c518" />
      </svg>
    </span>
  );
}

function StatTile({ value, label, icon, dark }: { value: number; label: string; icon: IconName; dark?: boolean }) {
  return (
    <div className={`relative flex h-[92px] min-w-0 flex-col justify-end rounded-[22px] p-3.5 ${dark ? 'bg-ink text-white' : 'bg-soft text-ink'}`}>
      <span className={`absolute top-3 right-3 flex size-7 items-center justify-center rounded-full ${dark ? 'bg-white/12 text-white' : 'bg-white text-ink-soft'}`}>
        <Icon name={icon} size={14} />
      </span>
      <span className="text-[26px] leading-none font-extrabold tabular-nums">{value}</span>
      <span className={`mt-1 truncate text-[12px] font-medium ${dark ? 'text-white/70' : 'text-ink-soft'}`}>{label}</span>
    </div>
  );
}

function MeetingCard({ m, selected, onOpen }: { m: Meeting; selected: boolean; onOpen: () => void }) {
  const ppl = people(m);
  const x = m.extraction;
  const blurb =
    x?.summary[0]?.text ??
    (m.status === 'transcribing'
      ? 'Transcribing and separating speakers.'
      : m.status === 'naming'
        ? 'Transcript ready. Name the speakers to generate minutes.'
        : m.status === 'extracting'
          ? 'Extracting decisions and action items.'
          : m.status === 'error'
            ? m.error ?? 'Something went wrong.'
            : '');
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={`block w-full rounded-[24px] border bg-white p-4 text-left transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] ${
        selected ? 'border-ink' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{m.title}</p>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            {ppl.length ? `${ppl.length} speaker${ppl.length === 1 ? '' : 's'} · ` : ''}
            {formatTime(m.duration)} · {new Date(`${m.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <StatusBadge status={m.status} />
      </div>
      {blurb && <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">{blurb}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-soft">
          {x ? `${x.actions.length} action${x.actions.length === 1 ? '' : 's'} · ${x.decisions.length} decision${x.decisions.length === 1 ? '' : 's'}` : ' '}
        </span>
        {ppl.length > 0 && <AvatarStack people={ppl} max={3} size={24} />}
      </div>
    </button>
  );
}

function EmptyList({ filtered, onNew }: { filtered: boolean; onNew: () => void }) {
  return (
    <div className="rounded-[24px] border-2 border-dashed border-line-strong p-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-soft">
        <Icon name={filtered ? 'search' : 'mic'} />
      </span>
      <p className="mt-3 text-sm font-bold">{filtered ? 'No meetings match' : 'No meetings yet'}</p>
      <p className="mt-1 text-[13px] text-ink-soft">
        {filtered ? 'Try another filter or search.' : 'Record one, upload a file, or run a sample to see how it works.'}
      </p>
      {!filtered && (
        <button type="button" onClick={onNew} className={`${btn.primary} mt-4`}>
          Start a meeting
        </button>
      )}
    </div>
  );
}
