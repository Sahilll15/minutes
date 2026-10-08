import { test } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { shouldFallBack, textRoutes, transcribeRoutes, withFallback, type Provider, type Route } from '../app/server/openai.ts';
import { normalizeSegments, undiarized } from './transcript.ts';

const fakeClients = (p: Provider) => ({ provider: p }) as unknown as OpenAI;
const apiError = (status: number) => Object.assign(new Error(`status ${status}`), { status });

test('routes stay on OpenAI when there is no Groq key', () => {
  assert.deepEqual(textRoutes({ OPENAI_API_KEY: 'sk' }), [{ provider: 'openai', model: 'gpt-5.4-mini' }]);
  assert.deepEqual(textRoutes({}), [{ provider: 'openai', model: 'gpt-5.4-mini' }]);
  assert.deepEqual(transcribeRoutes({ OPENAI_API_KEY: 'sk' }), [{ provider: 'openai', model: 'gpt-4o-transcribe-diarize' }]);
});

test('routes put Groq first and keep OpenAI as fallback only when its key is set', () => {
  assert.deepEqual(textRoutes({ GROQ_API_KEY: 'g' }), [{ provider: 'groq', model: 'openai/gpt-oss-120b' }]);
  assert.deepEqual(transcribeRoutes({ GROQ_API_KEY: 'g', OPENAI_API_KEY: 'sk' }), [
    { provider: 'groq', model: 'whisper-large-v3-turbo' },
    { provider: 'openai', model: 'gpt-4o-transcribe-diarize' },
  ]);
  assert.deepEqual(textRoutes({ GROQ_API_KEY: 'g', GROQ_MODEL: 'llama', OPENAI_API_KEY: 'sk', OPENAI_MODEL: 'gpt-x' }), [
    { provider: 'groq', model: 'llama' },
    { provider: 'openai', model: 'gpt-x' },
  ]);
  assert.equal(transcribeRoutes({ GROQ_API_KEY: 'g', GROQ_TRANSCRIBE_MODEL: 'whisper-large-v3' })[0].model, 'whisper-large-v3');
});

test('shouldFallBack covers 429, 413, 5xx and network errors but not client errors', () => {
  assert.equal(shouldFallBack(apiError(429)), true);
  assert.equal(shouldFallBack(apiError(413)), true);
  assert.equal(shouldFallBack(apiError(502)), true);
  assert.equal(shouldFallBack(new OpenAI.APIConnectionError({ message: 'down' })), true);
  assert.equal(shouldFallBack(new OpenAI.APIConnectionTimeoutError()), true);
  assert.equal(shouldFallBack(apiError(400)), false);
  assert.equal(shouldFallBack(new Error('bug')), false);
});

const both: Route[] = [
  { provider: 'groq', model: 'g-model' },
  { provider: 'openai', model: 'o-model' },
];

test('withFallback retries once on OpenAI with its own model after a Groq failure', async () => {
  const seen: string[] = [];
  const out = await withFallback(
    both,
    async (client, route) => {
      seen.push(`${(client as unknown as { provider: string }).provider}:${route.model}`);
      if (route.provider === 'groq') throw new OpenAI.APIConnectionError({ message: 'down' });
      return 'ok';
    },
    fakeClients,
  );
  assert.deepEqual(seen, ['groq:g-model', 'openai:o-model']);
  assert.deepEqual(out, { result: 'ok', route: both[1] });
});

test('withFallback stops on a client error and rethrows the last error', async () => {
  let calls = 0;
  await assert.rejects(withFallback(both, async () => { calls++; throw apiError(400); }, fakeClients), /status 400/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(withFallback(both, async () => { calls++; throw apiError(429); }, fakeClients), /status 429/);
  assert.equal(calls, 2);
});

test('Whisper segments become one-speaker turns', () => {
  const raw = undiarized([
    { start: 0, end: 2, text: 'Hello world.' },
    { start: 2.1, end: 4, text: 'We ship Friday.' },
  ]);
  assert.deepEqual(raw.map((s) => s.speaker), ['A', 'A']);
  assert.deepEqual(normalizeSegments(raw), [{ id: 's1', start: 0, end: 4, speaker: 'A', text: 'Hello world. We ship Friday.' }]);
});
