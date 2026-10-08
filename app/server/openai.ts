import OpenAI from 'openai';

export type Provider = 'groq' | 'openai';
export type Route = { provider: Provider; model: string };
type Env = Record<string, string | undefined>;

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
let client: OpenAI | null = null;
let groqClient: OpenAI | null = null;

export function openai() {
  client ??= new OpenAI({ maxRetries: 2, timeout: 110_000 });
  return client;
}

function groq() {
  groqClient ??= new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: GROQ_BASE_URL, maxRetries: 1, timeout: 110_000 });
  return groqClient;
}

function routes(env: Env, groqModel: string, openaiModel: string): Route[] {
  const out: Route[] = [];
  if (env.GROQ_API_KEY) out.push({ provider: 'groq', model: groqModel });
  if (env.OPENAI_API_KEY || !out.length) out.push({ provider: 'openai', model: openaiModel });
  return out;
}

/** Groq first when GROQ_API_KEY is set, with OpenAI as the fallback. */
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

export async function withFallback<T>(
  list: Route[],
  call: (client: OpenAI, route: Route) => Promise<T>,
  clientFor: (provider: Provider) => OpenAI = (p) => (p === 'groq' ? groq() : openai()),
): Promise<{ result: T; route: Route }> {
  for (const [i, route] of list.entries()) {
    try {
      return { result: await call(clientFor(route.provider), route), route };
    } catch (err) {
      if (i === list.length - 1 || !shouldFallBack(err)) throw err;
      console.warn(`${route.provider} failed, falling back`, (err as { status?: number })?.status, (err as Error)?.message);
    }
  }
  throw new Error('No model provider is configured');
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
