import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioDurationSeconds } from './audio-duration.ts';
import { readCapped } from '../app/server/body.ts';
import { clientIp, createDailyBudget, createLimiter, envInt, normalizeIp } from '../app/server/ratelimit.ts';

function chunked(chunks: number, size: number, onPull?: () => void, headers: Record<string, string> = {}) {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      onPull?.();
      if (sent++ >= chunks) return c.close();
      c.enqueue(new Uint8Array(size));
    },
  });
  return new Request('http://x/api', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
}

test('readCapped aborts a chunked body with no content-length once over the cap', async () => {
  let pulls = 0;
  const res = await readCapped(chunked(100_000, 1024, () => pulls++), 8192);
  assert.deepEqual(res, { ok: false, reason: 'too_large' });
  assert.ok(pulls < 20);
});

test('readCapped does not trust a small content-length', async () => {
  assert.equal((await readCapped(chunked(20, 1024, undefined, { 'content-length': '5' }), 8192)).ok, false);
});

test('readCapped rejects an oversized declared length up front', async () => {
  const res = await readCapped(new Request('http://x', { method: 'POST', body: 'abc', headers: { 'content-length': '999999999' } }), 8192);
  assert.equal(res.ok, false);
});

test('readCapped returns bodies under the cap intact', async () => {
  const res = await readCapped(chunked(4, 1000), 8192);
  assert.ok(res.ok && res.bytes.byteLength === 4000);
});

test('limiter keys ignore spoofable header variety and IPv6 rotation', () => {
  const h = (headers: Record<string, string>) => clientIp(new Request('http://x', { headers }));
  assert.equal(h({ 'x-forwarded-for': 'spoofed, 198.51.100.4' }), '198.51.100.4');
  assert.equal(h({ 'x-real-ip': '2001:db8:aa:bb::1' }), h({ 'x-real-ip': '2001:db8:aa:bb:ffff::2' }));
  assert.equal(h({ 'x-real-ip': 'garbage-1' }), h({ 'x-real-ip': 'garbage-2' }));
  assert.equal(normalizeIp('::ffff:10.0.0.1'), '10.0.0.1');
});

test('limiter evicts old keys instead of clearing active counters', () => {
  const l = createLimiter(50);
  const lim = { limit: 1, windowMs: 60_000 };
  l.hit('me', lim, 0);
  for (let i = 0; i < 40; i++) l.hit(`x${i}`, lim, 1);
  l.hit('me', lim, 2);
  for (let i = 40; i < 60; i++) l.hit(`x${i}`, lim, 3);
  assert.ok(l.size() <= 50);
  assert.ok(l.blocked('me', lim, 4) > 0);
});

test('envInt keeps the default for malformed values', () => {
  assert.equal(envInt('NaN', 3), 3);
  assert.equal(envInt('7', 3), 7);
});

test('daily audio budget reserves seconds and records overruns', () => {
  const b = createDailyBudget(600, () => '2026-10-03');
  assert.equal(b.take(500), true);
  assert.equal(b.take(200), false);
  b.add(150);
  assert.equal(b.take(1), false);
  assert.equal(b.used(), 650);
});

function wav(seconds: number, rate = 8000, format = 1) {
  const data = rate * 2 * seconds;
  const b = new Uint8Array(44 + data);
  const v = new DataView(b.buffer);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  v.setUint32(4, 36 + data, true);
  b.set([...'WAVEfmt '].map((c) => c.charCodeAt(0)), 8);
  v.setUint32(16, 16, true);
  v.setUint16(20, format, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  b.set([...'data'].map((c) => c.charCodeAt(0)), 36);
  v.setUint32(40, data, true);
  return b;
}

test('wav duration comes from the bytes present, not the declared size', () => {
  assert.equal(audioDurationSeconds(wav(3)), 3);
  const lying = wav(3);
  new DataView(lying.buffer).setUint32(40, 10, true);
  assert.equal(audioDurationSeconds(lying), 3);
  assert.equal(audioDurationSeconds(wav(1, 8000, 0x55)), null);
});

test('mp3 duration counts every frame', () => {
  // MPEG1 Layer III, 128 kbps, 44.1 kHz: 417 byte frames of 1152 samples.
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  const n = 383;
  const b = new Uint8Array(frame.length * n);
  for (let i = 0; i < n; i++) b.set(frame, i * frame.length);
  assert.ok(Math.abs(audioDurationSeconds(b)! - (n * 1152) / 44100) < 0.01);
});

test('real sample clips match their known length', () => {
  const ref = audioDurationSeconds(new Uint8Array(readFileSync('public/samples/refs/kickoff-dana.mp3')));
  assert.ok(ref !== null && Math.abs(ref - 7.4) < 0.2);
  const meeting = audioDurationSeconds(new Uint8Array(readFileSync('public/samples/kickoff.mp3')));
  assert.ok(meeting !== null && Math.abs(meeting - 106.15) < 0.5);
});

function ebml(id: number[], payload: number[], unknownSize = false) {
  const size = unknownSize ? [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff] : [0x01, ...Array.from({ length: 7 }, (_, i) => Math.floor(payload.length / 256 ** (6 - i)) % 256)];
  return [...id, ...size, ...payload];
}

test('webm without a Duration element falls back to the last block timestamp', () => {
  const block = (rel: number) => ebml([0xa3], [0x81, (rel >> 8) & 0xff, rel & 0xff, 0x80, 0, 0, 0]);
  const cluster = (tc: number, rels: number[]) =>
    ebml([0x1f, 0x43, 0xb6, 0x75], [...ebml([0xe7], [(tc >> 8) & 0xff, tc & 0xff]), ...rels.flatMap(block)], true);
  const header = ebml([0x1a, 0x45, 0xdf, 0xa3], [0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]);
  const segment = ebml([0x18, 0x53, 0x80, 0x67], [...cluster(0, [0, 20, 30000]), ...cluster(30000, [0, 15000])], true);
  assert.equal(audioDurationSeconds(new Uint8Array([...header, ...segment])), 45);
});

test('unknown containers return null', () => {
  assert.equal(audioDurationSeconds(new Uint8Array(4096).fill(7)), null);
  assert.equal(audioDurationSeconds(new Uint8Array(0)), null);
});

test('random bytes are not mistaken for mp3 frames', () => {
  let seed = 42;
  const rand = new Uint8Array(200_000).map(() => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 0xff);
  assert.equal(audioDurationSeconds(rand), null);
});
