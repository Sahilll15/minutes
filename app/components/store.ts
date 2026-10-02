'use client';

import { useSyncExternalStore } from 'react';
import type { Meeting } from '@/lib/types';

const KEY = 'minutes.meetings.v1';
const EMPTY: Meeting[] = [];
let cache: Meeting[] | null = null;
let booted = false;
const listeners = new Set<() => void>();

function read(): Meeting[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  if (booted) return cache;
  booted = true;
  // A reload mid-request leaves a meeting stuck; surface it as retryable instead.
  cache = cache.map((m) =>
    m.status === 'transcribing' || m.status === 'extracting'
      ? { ...m, status: 'error', error: 'This step was interrupted. Retry to continue.', failedStep: m.status === 'transcribing' ? 'transcribe' : 'extract' }
      : m,
  );
  return cache;
}

function write(next: Meeting[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota or private mode: keep the in-memory copy so the session still works.
  }
  listeners.forEach((l) => l());
}

export const meetingsStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        cache = null;
        l();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener('storage', onStorage);
    };
  },
  get: read,
  add(m: Meeting) {
    write([m, ...read()]);
  },
  update(id: string, patch: Partial<Meeting> | ((m: Meeting) => Partial<Meeting>)) {
    write(read().map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)));
  },
  remove(id: string) {
    write(read().filter((m) => m.id !== id));
  },
  find(id: string) {
    return read().find((m) => m.id === id) ?? null;
  },
};

export function useMeetings() {
  return useSyncExternalStore(meetingsStore.subscribe, meetingsStore.get, () => EMPTY);
}

const DB = 'minutes-audio';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('audio');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudio(id: string, blob: Blob) {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction('audio', 'readwrite');
      tx.objectStore('audio').put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Audio is a convenience for playback; the meeting record still works without it.
  }
}

export async function loadAudio(id: string): Promise<Blob | null> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction('audio').objectStore('audio').get(id);
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function deleteAudio(id: string) {
  try {
    const d = await db();
    d.transaction('audio', 'readwrite').objectStore('audio').delete(id);
  } catch {}
}
