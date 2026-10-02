'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { citedBy, findItem, groundingStats, indexSegments, quoteRange, segmentAt } from '@/lib/citations';
import { ownerName } from '@/lib/extraction';
import { buildIcs } from '@/lib/ics';
import { toMarkdown } from '@/lib/markdown';
import { formatTime, speakerName } from '@/lib/transcript';
import type { ActionItem, CitedItem, Meeting, SectionKey, Segment } from '@/lib/types';
import { extract, retry } from './pipeline';
import { deleteAudio, loadAudio, meetingsStore } from './store';
import { Avatar, AvatarStack, btn, Icon, type IconName, StatusBadge } from './ui';

const SECTION_META: Record<SectionKey, { title: string; short: string; icon: IconName; dot: string; empty: string }> = {
  summary: { title: 'Summary', short: 'Summary', icon: 'file', dot: 'bg-ink', empty: '' },
  decisions: { title: 'Decisions', short: 'Decision', icon: 'flag', dot: 'bg-lav', empty: 'No decisions were made.' },
  actions: { title: 'Action items', short: 'Action', icon: 'check', dot: 'bg-mint', empty: 'Nobody took on a task.' },
  questions: { title: 'Open questions', short: 'Question', icon: 'help', dot: 'bg-amber', empty: 'No open questions.' },
  risks: { title: 'Risks', short: 'Risk', icon: 'alert', dot: 'bg-red', empty: 'No risks were raised.' },
};

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'meeting';
}

function prettyDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', opts);
}

export function MeetingView({ meeting: m, onBack }: { meeting: Meeting; onBack: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [editSpeakers, setEditSpeakers] = useState(false);
  const [tab, setTab] = useState<'minutes' | 'transcript'>('minutes');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (m.audioUrl) return;
    let url: string | null = null;
    let live = true;
    loadAudio(m.id).then((b) => {
      if (!b || !live) return;
      url = URL.createObjectURL(b);
      setBlobUrl(url);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [m.id, m.audioUrl]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const src = m.audioUrl ?? blobUrl;
  const x = m.extraction;
  const index = useMemo(() => indexSegments(m.segments), [m.segments]);
  const reverse = useMemo(() => (x ? citedBy(x) : new Map()), [x]);
  const active = x && activeId ? findItem(x, activeId) : null;
  const activeSet = new Set(active?.segmentIds ?? []);
  const playingIdx = playing || time > 0 ? segmentAt(m.segments, time) : -1;
  const people = [...new Set(m.segments.map((s) => s.speaker))].map((label) => ({ label, name: speakerName(label, m.speakers) }));
  const showNaming = m.status === 'naming' || editSpeakers;

  function seek(t: number, play = false) {
    const a = audio.current;
    if (!a || !src) return;
    a.currentTime = t;
    setTime(t);
    if (play) void a.play().catch(() => {});
  }

  function jump(item: CitedItem) {
    const next = activeId === item.id ? null : item.id;
    setActiveId(next);
    setFlash((f) => f + 1);
    if (!next || !item.segmentIds.length) return;
    const first = index.get(item.segmentIds[0])?.segment;
    if (first && audio.current && !audio.current.paused) seek(first.start, true);
    else if (first) seek(first.start);
    if (window.matchMedia('(min-width: 1280px)').matches) {
      requestAnimationFrame(() => {
        document.getElementById(`seg-${item.segmentIds[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  function openInTranscript(segId: string) {
    setTab('transcript');
    requestAnimationFrame(() => document.getElementById(`seg-${segId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function rename(label: string, value: string) {
    meetingsStore.update(m.id, (cur) => ({ speakers: { ...cur.speakers, [label]: value.slice(0, 60) } }));
  }

  function toggleDone(id: string) {
    meetingsStore.update(m.id, (cur) => ({ done: cur.done.includes(id) ? cur.done.filter((d) => d !== id) : [...cur.done, id] }));
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${what} copied`);
    } catch {
      setToast('Copy failed. Your browser blocked clipboard access.');
    }
  }

  function remove() {
    if (!confirm(`Delete "${m.title}" from this browser?`)) return;
    void deleteAudio(m.id);
    meetingsStore.remove(m.id);
    onBack();
  }

  const icsTasks = x
    ? x.actions.map((a) => ({ id: a.id, task: a.text, due: a.due, owner: ownerName(a, m.speakers), at: a.at, quote: a.quote }))
    : [];
  const datedCount = icsTasks.filter((t) => t.due).length;
  const stats = x ? groundingStats(x) : null;

  return (
    <div className="animate-rise">
      <div className="border-b border-line bg-white px-4 pt-4 pb-4 sm:px-6">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onBack} className={`${btn.icon} shrink-0 lg:hidden`} aria-label="Back to meetings">
            <Icon name="back" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={m.status} />
              <span className="text-xs font-medium text-ink-faint">
                {prettyDate(m.date)} · {m.source === 'sample' ? 'Sample' : m.source === 'recorded' ? 'Recorded' : 'Uploaded'}
              </span>
            </div>
            <h1 className="mt-1.5 text-[22px] leading-tight font-extrabold tracking-tight sm:text-[26px]">{m.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-soft">
              {people.length > 0 && (
                <span className="flex items-center gap-2">
                  <AvatarStack people={people} max={4} size={24} />
                  {people.length} speaker{people.length === 1 ? '' : 's'}
                </span>
              )}
              {m.duration > 0 && (
                <span className="flex items-center gap-1.5">
                  <Icon name="clock" size={15} /> {formatTime(m.duration)}
                </span>
              )}
              {m.segments.length > 0 && m.status !== 'naming' && (
                <button type="button" onClick={() => setEditSpeakers((v) => !v)} className="flex items-center gap-1.5 font-semibold text-ink hover:underline">
                  <Icon name="edit" size={15} /> {editSpeakers ? 'Close speakers' : 'Rename speakers'}
                </button>
              )}
            </div>
          </div>
          <button type="button" onClick={remove} className={`${btn.icon} shrink-0 text-ink-soft`} aria-label="Delete meeting">
            <Icon name="trash" size={17} />
          </button>
        </div>

        <Stepper m={m} />

        {src && (
          <Player
            src={src}
            audioRef={audio}
            time={time}
            duration={m.duration}
            playing={playing}
            onTime={setTime}
            onPlaying={setPlaying}
            segments={m.segments}
            highlight={activeSet}
          />
        )}
      </div>

      {m.status === 'error' && (
        <div role="alert" className="mx-4 mt-4 flex flex-col gap-3 rounded-3xl bg-red-bg p-4 text-red sm:mx-6 sm:flex-row sm:items-center">
          <Icon name="alert" className="shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-bold">{m.failedStep === 'extract' ? 'Could not extract minutes' : 'Could not transcribe'}</p>
            <p className="mt-0.5">{m.error}</p>
          </div>
          <button type="button" onClick={() => retry(m)} className={btn.primary}>
            <Icon name="refresh" size={16} /> Retry
          </button>
        </div>
      )}

      {showNaming && m.segments.length > 0 && (
        <SpeakerPanel
          m={m}
          onRename={rename}
          onPlay={(s) => seek(s.start, true)}
          editing={editSpeakers}
          onDone={() => setEditSpeakers(false)}
          canPlay={!!src}
        />
      )}

      {m.status === 'transcribing' && <TranscribingState />}

      {(m.segments.length > 0 && m.status !== 'transcribing') && (
        <>
          <div className="sticky top-16 z-10 flex gap-1 border-b border-line bg-page/90 px-4 py-2 backdrop-blur xl:hidden" role="tablist">
            {(['minutes', 'transcript'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${tab === t ? 'bg-ink text-white' : 'text-ink-soft hover:bg-soft-strong'}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className={`${tab === 'minutes' ? 'block' : 'hidden'} min-w-0 space-y-4 p-4 sm:p-6 xl:block`}>
              {m.status === 'extracting' && <ExtractingState />}
              {m.status === 'naming' && !x && (
                <div className="rounded-3xl border-2 border-dashed border-line-strong p-6 text-center text-sm text-ink-soft">
                  Name the speakers above, then generate minutes. Names make owners and the follow-up email read properly.
                </div>
              )}
              {x && m.status !== 'extracting' && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <ExportBar
                      onCopy={() => copy(toMarkdown(m), 'Markdown')}
                      onMd={() => download(`${slug(m.title)}.md`, toMarkdown(m), 'text/markdown')}
                      onIcs={() => {
                        const ics = buildIcs(icsTasks, m);
                        if (ics) download(`${slug(m.title)}-actions.ics`, ics, 'text/calendar');
                      }}
                      datedCount={datedCount}
                      onRegenerate={() => extract(m.id)}
                    />
                  </div>
                  {stats && (
                    <p className="flex items-center gap-2 text-xs text-ink-soft">
                      <span className={`size-2 rounded-full ${stats.weak ? 'bg-mark-strong' : 'bg-mint'}`} />
                      {stats.weak
                        ? `${stats.grounded} of ${stats.total} items match their cited lines closely. ${stats.weak} marked "check source".`
                        : `All ${stats.total} items cite the transcript and match what was said.`}
                      {x.dropped > 0 && ` ${x.dropped} uncited item${x.dropped === 1 ? ' was' : 's were'} dropped.`}
                    </p>
                  )}

                  <SummaryCard items={x.summary} activeId={activeId} onJump={jump} />
                  {active && x.summary.some((s) => s.id === active.id) && (
                    <div className="rounded-[28px] bg-mark-wash pt-3 ring-1 ring-mark-strong/60 xl:hidden">
                      <SourcePreview key={flash} item={active} m={m} index={index} onPlay={(s) => seek(s.start, true)} onOpen={openInTranscript} canPlay={!!src} />
                    </div>
                  )}

                  <Section k="actions" count={x.actions.length}>
                    {x.actions.map((a) => (
                      <ActionRow
                        key={a.id}
                        a={a}
                        owner={ownerName(a, m.speakers)}
                        ownerLabel={a.ownerSpeaker}
                        done={m.done.includes(a.id)}
                        active={activeId === a.id}
                        onToggle={() => toggleDone(a.id)}
                        onJump={() => jump(a)}
                        source={activeId === a.id ? <SourcePreview key={flash} item={a} m={m} index={index} onPlay={(s) => seek(s.start, true)} onOpen={openInTranscript} canPlay={!!src} /> : null}
                      />
                    ))}
                  </Section>

                  {(['decisions', 'questions', 'risks'] as const).map((k) => (
                    <Section key={k} k={k} count={x[k].length}>
                      {x[k].map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          k={k}
                          active={activeId === item.id}
                          onJump={() => jump(item)}
                          source={activeId === item.id ? <SourcePreview key={flash} item={item} m={m} index={index} onPlay={(s) => seek(s.start, true)} onOpen={openInTranscript} canPlay={!!src} /> : null}
                        />
                      ))}
                    </Section>
                  ))}

                  <EmailCard subject={x.email.subject} body={x.email.body} onCopy={() => copy(`Subject: ${x.email.subject}\n\n${x.email.body}`, 'Email')} />
                  <p className="pb-2 text-[11px] text-ink-faint">
                    Extracted by {x.model} on {new Date(x.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.
                  </p>
                </>
              )}
            </div>

            <aside
              ref={transcriptRef}
              aria-label="Transcript"
              className={`${tab === 'transcript' ? 'block' : 'hidden'} border-line bg-white xl:sticky xl:top-16 xl:block xl:h-[calc(100dvh-64px)] xl:overflow-y-auto xl:border-l thin-scroll`}
            >
              <div className="sticky top-0 z-[5] hidden items-center justify-between border-b border-line bg-white/95 px-5 py-3 backdrop-blur xl:flex">
                <h2 className="text-sm font-bold">Transcript</h2>
                <span className="text-xs text-ink-faint">{m.segments.length} turns</span>
              </div>
              <ol className="space-y-1 p-3 sm:p-4">
                {m.segments.map((s, i) => (
                  <TranscriptRow
                    key={activeSet.has(s.id) ? `${s.id}-${flash}` : s.id}
                    s={s}
                    name={speakerName(s.speaker, m.speakers)}
                    active={activeSet.has(s.id)}
                    quote={activeSet.has(s.id) ? active?.quote ?? '' : ''}
                    playingNow={i === playingIdx && playing}
                    refs={reverse.get(s.id) ?? []}
                    onPlay={() => seek(s.start, true)}
                    onRef={(id) => {
                      const item = x ? findItem(x, id) : null;
                      if (item) jump(item);
                    }}
                    canPlay={!!src}
                  />
                ))}
              </ol>
            </aside>
          </div>
        </>
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center lg:bottom-8">
        {toast && <span className="animate-rise rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg">{toast}</span>}
      </div>
    </div>
  );
}

function Stepper({ m }: { m: Meeting }) {
  const steps = [
    { key: 'transcribe', label: 'Transcribe' },
    { key: 'name', label: 'Name speakers' },
    { key: 'extract', label: 'Extract minutes' },
  ];
  const at =
    m.status === 'transcribing' || (m.status === 'error' && m.failedStep === 'transcribe')
      ? 0
      : m.status === 'naming'
        ? 1
        : m.status === 'extracting' || m.status === 'error'
          ? 2
          : 3;
  if (at === 3) return null;
  return (
    <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Pipeline progress">
      {steps.map((s, i) => {
        const state = i < at ? 'done' : i === at ? (m.status === 'error' ? 'error' : 'now') : 'todo';
        return (
          <li key={s.key} className="min-w-0" aria-current={state === 'now' ? 'step' : undefined}>
            <div className="h-1 overflow-hidden rounded-full bg-soft-strong">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  state === 'done' ? 'w-full bg-ink' : state === 'now' ? 'w-1/2 animate-pulse bg-ink' : state === 'error' ? 'w-full bg-red' : 'w-0'
                }`}
              />
            </div>
            <p className={`mt-1.5 truncate text-[11px] font-semibold ${state === 'todo' ? 'text-ink-faint' : 'text-ink'}`}>
              {i + 1}. {s.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function Player({
  src,
  audioRef,
  time,
  duration,
  playing,
  onTime,
  onPlaying,
  segments,
  highlight,
}: {
  src: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  time: number;
  duration: number;
  playing: boolean;
  onTime: (t: number) => void;
  onPlaying: (p: boolean) => void;
  segments: Segment[];
  highlight: Set<string>;
}) {
  const [len, setLen] = useState(duration);
  const total = len || duration || 1;
  return (
    <div className="mt-4 flex items-center gap-3 rounded-full bg-soft py-1.5 pr-4 pl-1.5">
      <button
        type="button"
        onClick={() => {
          const a = audioRef.current;
          if (!a) return;
          if (a.paused) void a.play().catch(() => {});
          else a.pause();
        }}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-white active:scale-95"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={15} />
      </button>
      <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-ink-soft">{formatTime(time)}</span>
      <div className="relative h-6 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-soft-strong" />
        {segments
          .filter((s) => highlight.has(s.id))
          .map((s) => (
            <span
              key={s.id}
              className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-mark-strong/80"
              style={{ left: `${(s.start / total) * 100}%`, width: `${Math.max(0.6, ((s.end - s.start) / total) * 100)}%` }}
            />
          ))}
        <div className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-ink" style={{ width: `${Math.min(100, (time / total) * 100)}%` }} />
        <input
          type="range"
          min={0}
          max={total}
          step={0.1}
          value={Math.min(time, total)}
          onChange={(e) => {
            const t = Number(e.target.value);
            if (audioRef.current) audioRef.current.currentTime = t;
            onTime(t);
          }}
          aria-label="Seek"
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="hidden w-11 shrink-0 text-right font-mono text-xs tabular-nums text-ink-faint sm:block">{formatTime(total)}</span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
        onPlay={() => onPlaying(true)}
        onPause={() => onPlaying(false)}
        onEnded={() => onPlaying(false)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLen(e.currentTarget.duration)}
      />
    </div>
  );
}

function SpeakerPanel({
  m,
  onRename,
  onPlay,
  editing,
  onDone,
  canPlay,
}: {
  m: Meeting;
  onRename: (label: string, v: string) => void;
  onPlay: (s: Segment) => void;
  editing: boolean;
  onDone: () => void;
  canPlay: boolean;
}) {
  const labels = [...new Set(m.segments.map((s) => s.speaker))];
  return (
    <section className="mx-4 mt-4 animate-rise rounded-[28px] bg-white p-4 ring-1 ring-line sm:mx-6 sm:p-5" aria-labelledby="speakers-h">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="speakers-h" className="text-[17px] font-extrabold">Who is who?</h2>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {labels.length} voice{labels.length === 1 ? '' : 's'} detected. Play a line to check, then type a name. Leave blank to keep the label.
          </p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
        {labels.map((label) => {
          const turns = m.segments.filter((s) => s.speaker === label);
          const talk = turns.reduce((a, s) => a + (s.end - s.start), 0);
          const sample = turns.find((s) => s.text.split(' ').length >= 6) ?? turns[0];
          return (
            <li key={label} className="rounded-3xl bg-soft p-3">
              <div className="flex items-center gap-3">
                <Avatar label={label} name={speakerName(label, m.speakers)} size={36} ring={false} />
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Name for speaker {label}</span>
                  <input
                    value={m.speakers[label] ?? ''}
                    onChange={(e) => onRename(label, e.target.value)}
                    placeholder={`Speaker ${label}`}
                    className="w-full rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold outline-none transition placeholder:font-medium placeholder:text-ink-faint focus:border-ink"
                  />
                </label>
                {canPlay && (
                  <button type="button" onClick={() => onPlay(sample)} className={btn.icon} aria-label={`Play a line from speaker ${label}`}>
                    <Icon name="play" size={14} />
                  </button>
                )}
              </div>
              <p className="mt-2 line-clamp-2 pl-[48px] text-[13px] leading-snug text-ink-soft">&quot;{sample.text}&quot;</p>
              <p className="mt-1 pl-[48px] text-[11px] font-medium text-ink-faint">
                {turns.length} turn{turns.length === 1 ? '' : 's'} · {formatTime(talk)} talking
              </p>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {editing ? (
          <>
            <button type="button" onClick={onDone} className={btn.primary}>
              Done
            </button>
            {m.extraction && (
              <button
                type="button"
                onClick={() => {
                  onDone();
                  void extract(m.id);
                }}
                className={btn.soft}
              >
                <Icon name="refresh" size={15} /> Regenerate with new names
              </button>
            )}
            <span className="text-xs text-ink-faint">Owners update right away. Regenerate to rewrite the summary and email.</span>
          </>
        ) : (
          <>
            <button type="button" onClick={() => extract(m.id)} className={btn.primary}>
              <Icon name="sparkle" size={16} /> Generate minutes
            </button>
            <span className="text-xs text-ink-faint">One structured pass. About 10 to 20 seconds.</span>
          </>
        )}
      </div>
    </section>
  );
}

function TranscribingState() {
  return (
    <div className="space-y-4 p-4 sm:p-6" aria-busy="true">
      <div className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-line">
        <span className="flex size-10 items-center justify-center rounded-full bg-lav-bg text-lav">
          <Icon name="wave" className="animate-pulse" />
        </span>
        <div>
          <p className="text-sm font-bold">Transcribing and separating speakers</p>
          <p className="text-[13px] text-ink-soft">gpt-4o-transcribe-diarize takes about 30 to 60 seconds for a 2 minute meeting.</p>
        </div>
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3" style={{ opacity: 1 - i * 0.16 }}>
          <div className="skeleton size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-28" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExtractingState() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-line">
        <span className="flex size-10 items-center justify-center rounded-full bg-mark text-ink">
          <Icon name="sparkle" className="animate-spin [animation-duration:3s]" />
        </span>
        <div>
          <p className="text-sm font-bold">Extracting minutes</p>
          <p className="text-[13px] text-ink-soft">Each item has to cite the lines it came from. Uncited items get dropped.</p>
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-line">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-5/6" />
        </div>
      ))}
    </div>
  );
}

function ExportBar({
  onCopy,
  onMd,
  onIcs,
  datedCount,
  onRegenerate,
}: {
  onCopy: () => void;
  onMd: () => void;
  onIcs: () => void;
  datedCount: number;
  onRegenerate: () => void;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-full sm:flex-wrap sm:px-0">
      <button type="button" onClick={onCopy} className={`${btn.primary} shrink-0`}>
        <Icon name="copy" size={16} /> Copy markdown
      </button>
      <button type="button" onClick={onMd} className={`${btn.ghost} shrink-0`}>
        <Icon name="download" size={16} /> .md
      </button>
      <button
        type="button"
        onClick={onIcs}
        disabled={!datedCount}
        title={datedCount ? `${datedCount} action item${datedCount === 1 ? '' : 's'} with a due date` : 'No action item has a due date'}
        className={`${btn.ghost} shrink-0`}
      >
        <Icon name="calendar" size={16} /> .ics{datedCount ? ` (${datedCount})` : ''}
      </button>
      <button type="button" onClick={onRegenerate} className={`${btn.soft} shrink-0 sm:ml-auto`}>
        <Icon name="refresh" size={16} /> Regenerate
      </button>
    </div>
  );
}

function SummaryCard({ items, activeId, onJump }: { items: CitedItem[]; activeId: string | null; onJump: (i: CitedItem) => void }) {
  return (
    <section className="rounded-[28px] bg-ink p-5 text-white sm:p-6" aria-labelledby="sum-h">
      <h2 id="sum-h" className="flex items-center gap-2 text-xs font-bold tracking-wide text-white/60 uppercase">
        Summary
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed sm:text-[16px]">
        {items.map((s, i) => (
          <Fragment key={s.id}>
            <button
              type="button"
              onClick={() => onJump(s)}
              className={`rounded-md text-left decoration-white/40 underline-offset-4 transition hover:underline ${activeId === s.id ? 'bg-mark text-ink' : ''}`}
            >
              {s.text}
              {s.at != null && <span className={`ml-1.5 align-middle font-mono text-[11px] ${activeId === s.id ? 'text-ink/60' : 'text-white/45'}`}>{formatTime(s.at)}</span>}
            </button>
            {i < items.length - 1 ? ' ' : ''}
          </Fragment>
        ))}
      </p>
    </section>
  );
}

function Section({ k, count, children }: { k: SectionKey; count: number; children: React.ReactNode }) {
  const meta = SECTION_META[k];
  return (
    <section className="rounded-[28px] bg-white p-2 ring-1 ring-line" aria-labelledby={`h-${k}`}>
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <span className={`size-2 rounded-full ${meta.dot}`} />
        <h2 id={`h-${k}`} className="text-[15px] font-bold">
          {meta.title}
        </h2>
        <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-bold text-ink-soft">{count}</span>
      </div>
      {count ? <ul className="space-y-1">{children}</ul> : <p className="px-3 pb-3 text-sm text-ink-faint">{meta.empty}</p>}
    </section>
  );
}

function TimeChip({ at }: { at: number | null }) {
  if (at == null) return null;
  return <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[11px] text-ink-soft ring-1 ring-line">{formatTime(at)}</span>;
}

function WeakBadge({ item }: { item: CitedItem }) {
  if (item.grounded) return null;
  return (
    <span
      className="rounded-full bg-mark px-2 py-0.5 text-[11px] font-bold text-amber"
      title={`Only ${Math.round(item.support * 100)}% of the quoted words appear in the cited lines. Read the source before relying on it.`}
    >
      Check source
    </span>
  );
}

function ItemRow({
  item,
  k,
  active,
  onJump,
  source,
}: {
  item: CitedItem;
  k: SectionKey;
  active: boolean;
  onJump: () => void;
  source: React.ReactNode;
}) {
  return (
    <li className={`rounded-[20px] transition ${active ? 'bg-mark-wash ring-1 ring-mark-strong/60' : 'hover:bg-soft'}`}>
      <button type="button" onClick={onJump} aria-expanded={active} className="flex w-full items-start gap-3 rounded-[20px] px-3 py-2.5 text-left">
        <Icon name={SECTION_META[k].icon} size={16} className="mt-0.5 shrink-0 text-ink-faint" />
        <span className="min-w-0 flex-1 text-[14px] leading-snug">{item.text}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <WeakBadge item={item} />
          <TimeChip at={item.at} />
        </span>
      </button>
      {source}
    </li>
  );
}

function ActionRow({
  a,
  owner,
  ownerLabel,
  done,
  active,
  onToggle,
  onJump,
  source,
}: {
  a: ActionItem;
  owner: string | null;
  ownerLabel: string | null;
  done: boolean;
  active: boolean;
  onToggle: () => void;
  onJump: () => void;
  source: React.ReactNode;
}) {
  return (
    <li className={`rounded-[20px] transition ${active ? 'bg-mark-wash ring-1 ring-mark-strong/60' : 'hover:bg-soft'}`}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`Mark "${a.text}" ${done ? 'not done' : 'done'}`}
          onClick={onToggle}
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition ${done ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white hover:border-ink'}`}
        >
          {done && <Icon name="check" size={13} strokeWidth={3} />}
        </button>
        <button type="button" onClick={onJump} aria-expanded={active} className="min-w-0 flex-1 text-left">
          <span className={`block text-[14px] leading-snug ${done ? 'text-ink-faint line-through' : ''}`}>{a.text}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {owner ? (
              <span className="flex items-center gap-1.5 rounded-full bg-white py-0.5 pr-2 pl-0.5 text-[12px] font-semibold ring-1 ring-line">
                <Avatar label={ownerLabel ?? owner} name={owner} size={18} ring={false} />
                {owner}
              </span>
            ) : (
              <span className="rounded-full bg-soft px-2 py-0.5 text-[12px] font-semibold text-ink-faint">No owner</span>
            )}
            {a.due ? (
              <span className="flex items-center gap-1 rounded-full bg-mint-bg px-2 py-0.5 text-[12px] font-semibold text-mint" title={a.duePhrase ?? undefined}>
                <Icon name="calendar" size={12} /> {prettyDate(a.due)}
              </span>
            ) : a.duePhrase ? (
              <span className="rounded-full bg-soft px-2 py-0.5 text-[12px] font-semibold text-ink-soft">{a.duePhrase}</span>
            ) : null}
            <WeakBadge item={a} />
            <TimeChip at={a.at} />
          </span>
        </button>
      </div>
      {source}
    </li>
  );
}

function Highlighted({ text, quote }: { text: string; quote: string }) {
  const r = quote ? quoteRange(text, quote) : null;
  if (!r) return <>{text}</>;
  return (
    <>
      {text.slice(0, r[0])}
      <mark className="rounded bg-mark px-0.5 text-ink">{text.slice(r[0], r[1])}</mark>
      {text.slice(r[1])}
    </>
  );
}

function SourcePreview({
  item,
  m,
  index,
  onPlay,
  onOpen,
  canPlay,
}: {
  item: CitedItem;
  m: Meeting;
  index: ReturnType<typeof indexSegments>;
  onPlay: (s: Segment) => void;
  onOpen: (id: string) => void;
  canPlay: boolean;
}) {
  const segs = item.segmentIds.map((id) => index.get(id)?.segment).filter((s): s is Segment => !!s);
  return (
    <div className="animate-rise space-y-1.5 px-3 pb-3 xl:hidden">
      <p className="pl-1 text-[11px] font-bold tracking-wide text-ink-faint uppercase">Said in the meeting</p>
      {segs.map((s) => (
        <div key={s.id} className="flex gap-2.5 rounded-2xl bg-white p-2.5 ring-1 ring-line">
          <Avatar label={s.speaker} name={speakerName(s.speaker, m.speakers)} size={24} ring={false} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[12px] font-bold">
              {speakerName(s.speaker, m.speakers)}
              <span className="font-mono font-normal text-ink-faint">{formatTime(s.start)}</span>
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">
              <Highlighted text={s.text} quote={item.quote} />
            </p>
            <div className="mt-1.5 flex gap-3 text-[12px] font-semibold">
              {canPlay && (
                <button type="button" onClick={() => onPlay(s)} className="flex items-center gap-1 hover:underline">
                  <Icon name="play" size={11} /> Play
                </button>
              )}
              <button type="button" onClick={() => onOpen(s.id)} className="text-ink-soft hover:text-ink hover:underline">
                Open in transcript
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TranscriptRow({
  s,
  name,
  active,
  quote,
  playingNow,
  refs,
  onPlay,
  onRef,
  canPlay,
}: {
  s: Segment;
  name: string;
  active: boolean;
  quote: string;
  playingNow: boolean;
  refs: { section: SectionKey; id: string }[];
  onPlay: () => void;
  onRef: (id: string) => void;
  canPlay: boolean;
}) {
  return (
    <li
      id={`seg-${s.id}`}
      className={`relative scroll-mt-20 rounded-2xl px-3 py-2.5 transition-colors duration-300 ${
        active ? 'animate-flash bg-mark-wash ring-1 ring-mark-strong/70' : playingNow ? 'bg-soft' : ''
      }`}
    >
      {playingNow && <span className="absolute top-3 bottom-3 left-0 w-[3px] rounded-full bg-ink" aria-hidden="true" />}
      <div className="flex gap-3">
        <Avatar label={s.speaker} name={name} size={28} ring={false} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-bold">{name}</span>
            {canPlay ? (
              <button type="button" onClick={onPlay} className="rounded font-mono text-[11px] text-ink-faint hover:text-ink hover:underline" aria-label={`Play from ${formatTime(s.start)}`}>
                {formatTime(s.start)}
              </button>
            ) : (
              <span className="font-mono text-[11px] text-ink-faint">{formatTime(s.start)}</span>
            )}
            <span className="ml-auto flex gap-1">
              {refs
                .filter((r, i) => r.section !== 'summary' && refs.findIndex((o) => o.section === r.section) === i)
                .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onRef(r.id)}
                  className="flex items-center gap-1 rounded-full bg-soft px-1.5 py-0.5 text-[10px] font-bold text-ink-soft hover:bg-soft-strong"
                  title={`Cited by a ${SECTION_META[r.section].short.toLowerCase()}`}
                >
                  <span className={`size-1.5 rounded-full ${SECTION_META[r.section].dot}`} />
                  {SECTION_META[r.section].short}
                </button>
              ))}
            </span>
          </div>
          <p className="mt-0.5 text-[14px] leading-relaxed text-ink/85">
            <Highlighted text={s.text} quote={quote} />
          </p>
        </div>
      </div>
    </li>
  );
}

function EmailCard({ subject, body, onCopy }: { subject: string; body: string; onCopy: () => void }) {
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <section className="rounded-[28px] bg-white p-4 ring-1 ring-line sm:p-5" aria-labelledby="email-h">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="mail" size={17} />
        <h2 id="email-h" className="text-[15px] font-bold">
          Follow-up email draft
        </h2>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={onCopy} className={btn.soft}>
            <Icon name="copy" size={15} /> Copy
          </button>
          {mailto.length < 1900 && (
            <a href={mailto} className={btn.ghost}>
              Open in mail
            </a>
          )}
        </span>
      </div>
      <div className="mt-3 rounded-3xl bg-soft p-4">
        <p className="text-[13px]">
          <span className="text-ink-faint">Subject </span>
          <span className="font-semibold">{subject}</span>
        </p>
        <pre className="mt-3 font-sans text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink/85">{body}</pre>
      </div>
    </section>
  );
}
