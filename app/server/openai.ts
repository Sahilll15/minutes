import OpenAI from 'openai';

let client: OpenAI | null = null;

export function openai() {
  client ??= new OpenAI({ maxRetries: 2, timeout: 110_000 });
  return client;
}

export const TEXT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
export const TRANSCRIBE_MODEL = 'gpt-4o-transcribe-diarize';

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
