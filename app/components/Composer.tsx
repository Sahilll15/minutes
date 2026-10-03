'use client';

import { useEffect, useRef, useState } from 'react';
import { AUDIO_EXT, MAX_AUDIO_BYTES } from '@/lib/limits';
import { SAMPLES, type Sample } from '@/lib/samples';
import { formatTime } from '@/lib/transcript';
import { Avatar, AvatarStack, btn, Icon } from './ui';

type Props = {
  onCreate: (input: { title: string; date: string; blob: Blob; source: 'recorded' | 'uploaded'; duration: number }) => void;
  onSample: (s: Sample) => void;
};

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`;
}

const MIME = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
const SAFE_LIMIT = MAX_AUDIO_BYTES - 64 * 1024;

export function Composer({ onCreate, onSample }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const finalTitle = () => title.trim() || `Meeting on ${new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  function accept(file: File) {
    setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/') && !AUDIO_EXT.includes(ext)) {
      setError('That does not look like an audio file. Try mp3, m4a, wav, webm or ogg.');
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setError(`That file is ${mb(file.size)}. The limit is 4 MB, so trim it or export at a lower bitrate.`);
      return;
    }
    if (file.size === 0) {
      setError('That file is empty.');
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = 'metadata';
    const done = (duration: number) => {
      URL.revokeObjectURL(url);
      onCreate({ title: title.trim() || file.name.replace(/\.[^.]+$/, '').slice(0, 80), date, blob: file, source: 'uploaded', duration });
    };
    probe.onloadedmetadata = () => done(Number.isFinite(probe.duration) ? probe.duration : 0);
    probe.onerror = () => done(0);
    probe.src = url;
  }

  return (
    <div className="mx-auto w-full max-w-3xl animate-rise space-y-6 p-4 sm:p-8">
      <div>
        <p className="text-sm font-semibold text-ink-faint">New meeting</p>
        <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight sm:text-[34px]">
          <span className="sr-only">Minutes, AI meeting minutes: </span>
          Turn a meeting into minutes you can check.
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-ink-soft">
          Record or upload up to 4 MB of audio. You get speaker labels, a summary, decisions, action items, open questions and risks, each linked to the exact moment it was said.
        </p>
      </div>

      <section aria-labelledby="samples-h" className="rounded-[28px] bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] ring-1 ring-line sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="samples-h" className="flex items-center gap-2 text-[15px] font-bold">
            <Icon name="sparkle" size={16} /> Try a sample meeting
          </h2>
          <span className="hidden text-xs text-ink-faint sm:inline">Real pipeline, about a minute</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SAMPLES.map((s) => (
            <SampleCard key={s.id} sample={s} onRun={() => onSample(s)} />
          ))}
        </div>
      </section>

      <section aria-labelledby="own-h" className="rounded-[28px] bg-white p-4 ring-1 ring-line sm:p-5">
        <h2 id="own-h" className="text-[15px] font-bold">Your own meeting</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_170px]">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 120))}
              placeholder="Weekly product sync"
              className="mt-1 w-full rounded-2xl border border-line bg-soft px-4 py-2.5 text-sm outline-none transition placeholder:text-ink-faint focus:border-ink focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-line bg-soft px-4 py-2.5 text-sm outline-none transition focus:border-ink focus:bg-white"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Recorder
            onError={setError}
            onDone={(blob, duration) => onCreate({ title: finalTitle(), date, blob, source: 'recorded', duration })}
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) accept(f);
            }}
            className={`flex min-h-[188px] flex-col items-center justify-center rounded-3xl border-2 border-dashed p-5 text-center transition ${
              drag ? 'border-ink bg-mark-wash' : 'border-line-strong bg-soft'
            }`}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-white ring-1 ring-line">
              <Icon name="upload" />
            </span>
            <p className="mt-3 text-sm font-bold">Drop an audio file</p>
            <p className="mt-0.5 text-xs text-ink-soft">mp3, m4a, wav, webm, ogg. Up to 4 MB.</p>
            <button type="button" onClick={() => fileRef.current?.click()} className={`${btn.ghost} mt-3`}>
              Choose file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.flac,.mp4"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) accept(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-red-bg px-4 py-3 text-sm text-red">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          Audio is sent to OpenAI for transcription and is not stored on a server. Meetings stay in this browser.
        </p>
      </section>
    </div>
  );
}

function SampleCard({ sample, onRun }: { sample: Sample; onRun: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <div className="group flex flex-col rounded-3xl bg-soft p-4 transition hover:bg-soft-strong/70">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-bold leading-snug">{sample.title}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {sample.people.length} speakers · {formatTime(sample.seconds)}
          </p>
        </div>
        <AvatarStack people={sample.people.map((p) => ({ label: p, name: p }))} size={24} />
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{sample.blurb}</p>
      <div className="mt-auto flex items-center gap-2 pt-4">
        <button type="button" onClick={onRun} className={btn.primary}>
          Run pipeline
        </button>
        <button
          type="button"
          aria-label={playing ? `Pause ${sample.title}` : `Preview ${sample.title} audio`}
          onClick={() => {
            const a = audio.current;
            if (!a) return;
            if (a.paused) void a.play();
            else a.pause();
          }}
          className={btn.icon}
        >
          <Icon name={playing ? 'pause' : 'play'} size={15} />
        </button>
        <a href={sample.scriptUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline">
          Script
        </a>
        <audio ref={audio} src={sample.audioUrl} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      </div>
    </div>
  );
}

type RecState = { kind: 'idle' } | { kind: 'recording'; started: number } | { kind: 'review'; blob: Blob; url: string; duration: number };

function Recorder({ onDone, onError }: { onDone: (blob: Blob, duration: number) => void; onError: (e: string | null) => void }) {
  const [state, setState] = useState<RecState>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(28).fill(0.08));
  const rec = useRef<MediaRecorder | null>(null);
  const cleanup = useRef<() => void>(() => {});

  useEffect(() => () => cleanup.current(), []);

  async function start() {
    onError(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError('Recording is not supported in this browser. Upload a file instead.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      onError('Microphone access was blocked. Allow it in your browser settings, or upload a file.');
      return;
    }
    const mimeType = MIME.find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    let size = 0;
    const started = Date.now();

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
      setLevels((prev) => [...prev.slice(1), Math.max(0.08, Math.min(1, avg * 2.2))]);
      setElapsed((Date.now() - started) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    cleanup.current = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => {});
    };

    r.ondataavailable = (e) => {
      if (!e.data.size) return;
      chunks.push(e.data);
      size += e.data.size;
      setBytes(size);
      if (size >= SAFE_LIMIT && r.state === 'recording') {
        onError('Stopped at the 4 MB limit.');
        r.stop();
      }
    };
    r.onstop = () => {
      cleanup.current();
      const blob = new Blob(chunks, { type: r.mimeType || mimeType || 'audio/webm' });
      const duration = (Date.now() - started) / 1000;
      if (duration < 2 || blob.size === 0) {
        onError('That recording was too short.');
        setState({ kind: 'idle' });
        return;
      }
      setState({ kind: 'review', blob, url: URL.createObjectURL(blob), duration });
    };
    r.start(1000);
    rec.current = r;
    setBytes(0);
    setElapsed(0);
    setState({ kind: 'recording', started });
  }

  function discard() {
    if (state.kind === 'review') URL.revokeObjectURL(state.url);
    setState({ kind: 'idle' });
    setLevels(Array(28).fill(0.08));
  }

  const pct = Math.min(100, (bytes / MAX_AUDIO_BYTES) * 100);

  return (
    <div className="relative flex min-h-[188px] flex-col overflow-hidden rounded-3xl bg-ink p-5 text-white">
      {state.kind === 'idle' && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <button
            type="button"
            onClick={start}
            className="group relative flex size-16 items-center justify-center rounded-full bg-white text-ink transition hover:scale-105 active:scale-95"
            aria-label="Start recording"
          >
            <span className="absolute inset-0 rounded-full bg-white/30 transition group-hover:scale-125 group-hover:opacity-0" />
            <Icon name="mic" size={24} />
          </button>
          <p className="mt-3 text-sm font-bold">Record in the browser</p>
          <p className="mt-0.5 text-xs text-white/60">Up to about 15 minutes at speech quality</p>
        </div>
      )}

      {state.kind === 'recording' && (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between text-xs text-white/70">
            <span className="flex items-center gap-2 font-semibold text-white">
              <span className="size-2 animate-pulse rounded-full bg-[#ff5b4a]" /> Recording
            </span>
            <span className="font-mono">{mb(bytes)} of 4 MB</span>
          </div>
          <div className="mt-4 flex h-14 items-center gap-[3px]" aria-hidden="true">
            {levels.map((l, i) => (
              <span key={i} className="w-full rounded-full bg-white/85 transition-[height] duration-100" style={{ height: `${l * 100}%` }} />
            ))}
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-mark-strong transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-auto flex items-center justify-between pt-4">
            <span className="font-mono text-2xl tabular-nums" aria-live="off">
              {formatTime(elapsed)}
            </span>
            <button type="button" onClick={() => rec.current?.stop()} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink active:scale-95">
              <Icon name="stop" size={14} /> Stop
            </button>
          </div>
        </div>
      )}

      {state.kind === 'review' && (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-3">
            <Avatar label="rec" name="Rec" size={34} ring={false} />
            <div>
              <p className="text-sm font-bold">Recording ready</p>
              <p className="font-mono text-xs text-white/60">
                {formatTime(state.duration)} · {mb(state.blob.size)}
              </p>
            </div>
          </div>
          <audio src={state.url} controls className="mt-4 h-9 w-full [color-scheme:dark]" />
          <div className="mt-auto flex gap-2 pt-4">
            <button
              type="button"
              onClick={() => {
                const s = state;
                setState({ kind: 'idle' });
                onDone(s.blob, s.duration);
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-ink active:scale-[0.98]"
            >
              Transcribe
            </button>
            <button type="button" onClick={discard} className="rounded-full px-4 py-2.5 text-sm font-semibold text-white/80 ring-1 ring-white/25 hover:text-white">
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
