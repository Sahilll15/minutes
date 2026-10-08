import OpenAI from 'openai';

export type Provider = 'groq' | 'openai';
export type Route = { provider: Provider; model: string };
type Env = Record<string, string | undefined>;

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
let client: OpenAI | null = null;
const groqClients = new Map<string, OpenAI>();

export function openai() {
  client ??= new OpenAI({ maxRetries: 2, timeout: 110_000 });
  return client;
}

function groq(apiKey: string) {
  let c = groqClients.get(apiKey);
  if (!c) groqClients.set(apiKey, (c = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL, maxRetries: 1, timeout: 110_000 })));
  return c;
}

/** GROQ_API_KEY first, then GROQ_API_KEYS (comma or newline separated), trimmed and without duplicates. */
export function groqKeys(env: Env = process.env) {
  const all = [env.GROQ_API_KEY ?? '', ...(env.GROQ_API_KEYS ?? '').split(/[,\n]/)].map((k) => k.trim());
  return [...new Set(all.filter(Boolean))];
}

function routes(env: Env, groqModel: string, openaiModel: string): Route[] {
  const out: Route[] = [];
  if (groqKeys(env).length) out.push({ provider: 'groq', model: groqModel });
  if (env.OPENAI_API_KEY || !out.length) out.push({ provider: 'openai', model: openaiModel });
  return out;
}

/** Groq first when any Groq key is set, with OpenAI as the fallback. */
export function textRoutes(env: Env = process.env) {
  return routes(env, env.GROQ_MODEL || 'openai/gpt-oss-120b', env.OPENAI_MODEL || 'gpt-5.4-mini');
}

export function transcribeRoutes(env: Env = process.env) {
  return routes(env, env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo', 'gpt-4o-transcribe-diarize');
}

/** Rate limits (429, or 413 for one request over the token budget), server errors and network failures are worth another provider; a bad request is not. */
export function shouldFallBack(err: unknown) {
  if (err instanceof OpenAI.APIConnectionError) return true;
  const status = (err as { status?: number })?.status;
  return status === 429 || status === 413 || (typeof status === 'number' && status >= 500);
}

const HOUR = 3_600_000;
const UNIT_MS: Record<string, number> = { h: HOUR, m: 60_000, s: 1000, ms: 1 };

/** How long to rest a Groq key after this error: retry-after on 429/413 (kept between 1s and 1 day), an hour on 401/403, else 0. */
export function cooldownMs(err: unknown) {
  const e = err as { status?: number; headers?: Headers; message?: string } | null;
  if (e?.status === 401 || e?.status === 403) return HOUR;
  if (e?.status !== 429 && e?.status !== 413) return 0;
  const header = Number(e.headers?.get?.('retry-after')) * 1000;
  const wait = e.message?.match(/try again in ([\d.hms]+)/)?.[1] ?? '';
  const parsed = [...wait.matchAll(/([\d.]+)(ms|h|m|s)/g)].reduce((t, [, n, unit]) => t + Number(n) * UNIT_MS[unit], 0);
  const ms = header > 0 ? header : parsed;
  return ms > 0 ? Math.min(Math.max(ms, 1000), 86_400_000) : 60_000;
}

const cooldowns = new Map<OpenAI, { until: number; status: number }>();
const defaultClients = (p: Provider) => (p === 'groq' ? groqKeys().map(groq) : [openai()]);

/** Tries Groq keys in order (next key on 429, 413, 401, 403), skipping keys on cooldown, then OpenAI once if the last Groq failure is worth it. */
export async function withFallback<T>(
  list: Route[],
  call: (client: OpenAI, route: Route) => Promise<T>,
  clientsFor: (provider: Provider) => OpenAI[] = defaultClients,
  now: () => number = Date.now,
): Promise<{ result: T; route: Route }> {
  let last: unknown;
  for (const route of list) {
    if (route.provider === 'openai' && last !== undefined) {
      if (!shouldFallBack(last)) throw last;
      console.warn('groq failed, falling back to openai', (last as { status?: number })?.status, (last as Error)?.message);
    }
    const clients = clientsFor(route.provider);
    for (const [i, c] of clients.entries()) {
      const resting = cooldowns.get(c);
      if (resting && resting.until > now()) {
        last = OpenAI.APIError.generate(resting.status, undefined, `groq key ${i + 1} of ${clients.length} is cooling down`, new Headers());
        continue;
      }
      try {
        return { result: await call(c, route), route };
      } catch (err) {
        if (route.provider !== 'groq' || !(shouldFallBack(err) || cooldownMs(err))) throw err;
        last = err;
        const wait = cooldownMs(err);
        console.warn(`groq key ${i + 1} of ${clients.length} failed`, (err as { status?: number })?.status ?? 'network');
        // A 5xx or network error is Groq itself, not this key, so the other keys are skipped.
        if (!wait) break;
        cooldowns.set(c, { until: now() + wait, status: (err as { status: number }).status });
      }
    }
  }
  throw last ?? new Error('No model provider is configured');
}

export function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

export function upstreamError(err: unknown) {
  if (err instanceof OpenAI.APIError) {
    console.error('openai error', err.status, err.message);
    if (err.status === 429) return fail(503, 'The model is busy right now. Try again in a minute.');
    if (err.status === 400) return fail(422, 'The model could not process this input. Check the audio file and try again.');
    return fail(502, 'The model request failed. Try again in a moment.');
  }
  console.error('unexpected error', err);
  return fail(500, 'Something went wrong on our side.');
}
