import { test } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { cooldownMs, groqKeys, shouldFallBack, textRoutes, transcribeRoutes, withFallback, type Provider, type Route } from '../app/server/openai.ts';
import { normalizeSegments, undiarized } from './transcript.ts';

const fakeClients = (p: Provider) => [{ provider: p }] as unknown as OpenAI[];
const apiError = (status: number, message = `status ${status}`, headers = new Headers()) => Object.assign(new Error(message), { status, headers });
console.warn = () => {};

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

test('groqKeys merges GROQ_API_KEY and GROQ_API_KEYS in order without duplicates', () => {
  assert.deepEqual(groqKeys({ GROQ_API_KEY: 'b', GROQ_API_KEYS: ' a, b\nc,,\n' }), ['b', 'a', 'c']);
  assert.deepEqual(groqKeys({ GROQ_API_KEYS: 'x\r\ny' }), ['x', 'y']);
  assert.deepEqual(groqKeys({ GROQ_API_KEYS: ' , ' }), []);
});

test('textRoutes turns Groq on from GROQ_API_KEYS alone, and an empty list means OpenAI only', () => {
  assert.equal(textRoutes({ GROQ_API_KEYS: 'a,b', OPENAI_API_KEY: 'sk' })[0].provider, 'groq');
  assert.deepEqual(textRoutes({ GROQ_API_KEYS: ' , ', OPENAI_API_KEY: 'sk' }), [{ provider: 'openai', model: 'gpt-5.4-mini' }]);
});

test('cooldownMs reads retry-after, then the "try again in" text, then defaults to 60s', () => {
  assert.equal(cooldownMs(apiError(429, 'x', new Headers({ 'retry-after': '7' }))), 7000);
  assert.equal(cooldownMs(apiError(429, 'Please try again in 6m6.7s. Need more tokens?')), 366_700);
  assert.equal(cooldownMs(apiError(413, 'Please try again in 250ms')), 1000);
  assert.equal(cooldownMs(apiError(429, 'x', new Headers({ 'retry-after': '0.01' }))), 1000);
  assert.equal(cooldownMs(apiError(429, 'x', new Headers({ 'retry-after': '9999999' }))), 86_400_000);
  assert.equal(cooldownMs(apiError(429, 'Please try again in 30h0m0s')), 86_400_000);
  assert.equal(cooldownMs(apiError(429)), 60_000);
  assert.equal(cooldownMs(apiError(401)), 3_600_000);
  assert.equal(cooldownMs(apiError(403)), 3_600_000);
  assert.equal(cooldownMs(apiError(500)), 0);
  assert.equal(cooldownMs(apiError(400)), 0);
});

// Stable fake clients so cooldowns carry over between calls.
const keyed = () => {
  const groq = [{ name: 'k1' }, { name: 'k2' }] as unknown as OpenAI[];
  const oai = [{ name: 'openai' }] as unknown as OpenAI[];
  return (p: Provider) => (p === 'groq' ? groq : oai);
};
const nameOf = (c: OpenAI) => (c as unknown as { name: string }).name;

test('a rate-limited key is skipped for the next key, and stays skipped while cooling down', async () => {
  const clients = keyed();
  let clock = 1_000;
  const tried: string[] = [];
  const call = async (c: OpenAI) => {
    tried.push(nameOf(c));
    if (nameOf(c) === 'k1') throw apiError(429, 'x', new Headers({ 'retry-after': '30' }));
    return nameOf(c);
  };
  assert.equal((await withFallback(both, call, clients, () => clock)).result, 'k2');
  assert.equal((await withFallback(both, call, clients, () => clock)).result, 'k2');
  assert.deepEqual(tried, ['k1', 'k2', 'k2']);
  clock += 30_001;
  await withFallback(both, call, clients, () => clock);
  assert.deepEqual(tried, ['k1', 'k2', 'k2', 'k1', 'k2']);
});

test('a rejected key (401) moves on to the next key', async () => {
  const tried: string[] = [];
  const out = await withFallback(both, async (c) => {
    tried.push(nameOf(c));
    if (nameOf(c) === 'k1') throw apiError(401);
    return nameOf(c);
  }, keyed());
  assert.deepEqual(out, { result: 'k2', route: both[0] });
  assert.deepEqual(tried, ['k1', 'k2']);
});

test('when every key is rate limited or cooling down, OpenAI answers', async () => {
  const clients = keyed();
  const tried: string[] = [];
  const call = async (c: OpenAI, route: Route) => {
    tried.push(nameOf(c));
    if (route.provider === 'groq') throw apiError(429);
    return nameOf(c);
  };
  assert.deepEqual(await withFallback(both, call, clients), { result: 'openai', route: both[1] });
  assert.deepEqual(await withFallback(both, call, clients), { result: 'openai', route: both[1] });
  assert.deepEqual(tried, ['k1', 'k2', 'openai', 'openai']);
});

test('without OpenAI, exhausted keys surface the last Groq error', async () => {
  const clients = keyed();
  await assert.rejects(withFallback([both[0]], async () => { throw apiError(429); }, clients), { status: 429 });
  await assert.rejects(withFallback([both[0]], async () => 'never', clients), { status: 429 });
});

test('a Groq 5xx goes straight to OpenAI without trying the other keys', async () => {
  const tried: string[] = [];
  const out = await withFallback(both, async (c, route) => {
    tried.push(nameOf(c));
    if (route.provider === 'groq') throw apiError(503);
    return nameOf(c);
  }, keyed());
  assert.deepEqual(out, { result: 'openai', route: both[1] });
  assert.deepEqual(tried, ['k1', 'openai']);
});
