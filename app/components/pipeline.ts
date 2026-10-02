'use client';

import { SAMPLES } from '@/lib/samples';
import type { Extraction, Meeting, Segment } from '@/lib/types';
import { loadAudio, meetingsStore } from './store';

async function post<T>(url: string, body: BodyInit, json = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      body,
      headers: json ? { 'content-type': 'application/json' } : undefined,
    });
  } catch {
    throw new Error('Network error. Check your connection and retry.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

async function audioFor(m: Meeting): Promise<Blob> {
  if (m.audioUrl) {
    const res = await fetch(m.audioUrl);
    if (!res.ok) throw new Error('Could not load the sample audio.');
    return res.blob();
  }
  const blob = await loadAudio(m.id);
  if (!blob) throw new Error('The audio for this meeting is no longer stored in this browser.');
  return blob;
}

function extFor(blob: Blob, fallback = 'webm') {
  const t = blob.type;
  if (t.includes('mp4')) return 'mp4';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('wav')) return 'wav';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('m4a') || t.includes('aac')) return 'm4a';
  if (t.includes('webm')) return 'webm';
  return fallback;
}

export async function transcribe(id: string, given?: Blob) {
  const m = meetingsStore.find(id);
  if (!m) return;
  meetingsStore.update(id, { status: 'transcribing', error: undefined, failedStep: undefined });
  try {
    const blob = given ?? (await audioFor(m));
    const form = new FormData();
    const name = blob instanceof File && /\.\w+$/.test(blob.name) ? blob.name : `meeting.${extFor(blob)}`;
    form.append('file', blob, name);
    const sample = SAMPLES.find((s) => s.id === m.sampleId);
    for (const ref of sample?.refs ?? []) {
      const r = await fetch(ref.url);
      if (!r.ok) continue;
      form.append('speaker_name', ref.name);
      form.append('speaker_ref', await r.blob(), ref.url.split('/').pop());
    }
    const data = await post<{ segments: Segment[]; duration: number; speakers: string[] }>('/api/transcribe', form);
    meetingsStore.update(id, (cur) => ({
      status: 'naming',
      segments: data.segments,
      duration: data.duration,
      speakers: Object.fromEntries(data.speakers.map((l) => [l, cur.speakers[l] ?? ''])),
    }));
  } catch (e) {
    meetingsStore.update(id, { status: 'error', error: (e as Error).message, failedStep: 'transcribe' });
  }
}

export async function extract(id: string) {
  const m = meetingsStore.find(id);
  if (!m || !m.segments.length) return;
  meetingsStore.update(id, { status: 'extracting', error: undefined, failedStep: undefined });
  try {
    const data = await post<{ extraction: Extraction }>(
      '/api/extract',
      JSON.stringify({ title: m.title, date: m.date, speakers: m.speakers, segments: m.segments }),
      true,
    );
    meetingsStore.update(id, { status: 'ready', extraction: data.extraction, done: [] });
  } catch (e) {
    meetingsStore.update(id, { status: 'error', error: (e as Error).message, failedStep: 'extract' });
  }
}

export function retry(m: Meeting) {
  return m.failedStep === 'extract' ? extract(m.id) : transcribe(m.id);
}
