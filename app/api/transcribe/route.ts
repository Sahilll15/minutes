import { toFile } from 'openai';
import type { TranscriptionDiarized } from 'openai/resources/audio/transcriptions';
import { audioDurationSeconds } from '@/lib/audio-duration';
import { audioExt, FORM_OVERHEAD, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, MAX_REF_BYTES, MAX_REF_SECONDS, MAX_REFS } from '@/lib/limits';
import { readCapped } from '@/app/server/body';
import { normalizeSegments, speakerLabels } from '@/lib/transcript';
import { fail, openai, TRANSCRIBE_MODEL, upstreamError } from '@/app/server/openai';
import { audioBudget, budgetSpent, check, isBlocked, tooMany } from '@/app/server/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TOO_BIG = 'Audio must be 4 MB or smaller.';

function audioMime(f: File) {
  if (f.type.startsWith('audio/')) return f.type;
  const ext = audioExt(f.name, f.type);
  return ext === 'mp3' || ext === 'mpga' ? 'audio/mpeg' : `audio/${ext}`;
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return fail(400, 'Send the audio as multipart form data in a "file" field.');
  }
  // Refuse before reading the upload when this IP is already over its limit.
  const peek = await isBlocked(req, 'transcribe');
  if (peek) return tooMany(peek);

  const body = await readCapped(req, MAX_AUDIO_BYTES + FORM_OVERHEAD);
  if (!body.ok) return body.reason === 'too_large' ? fail(413, TOO_BIG) : fail(400, 'Could not read the upload.');

  let form: FormData;
  try {
    form = await new Response(body.bytes as BodyInit, { headers: { 'content-type': contentType } }).formData();
  } catch {
    return fail(400, 'Could not read the upload.');
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail(400, 'No audio file was attached.');
  if (file.size > MAX_AUDIO_BYTES) return fail(413, TOO_BIG);
  const ext = audioExt(file.name, file.type);
  if (!ext) return fail(415, 'Unsupported format. Use mp3, m4a, mp4, wav, webm, ogg or flac.');

  const names = form.getAll('speaker_name').map((n) => String(n).trim().slice(0, 40));
  const refs = form.getAll('speaker_ref');
  if (names.length !== refs.length || names.length > MAX_REFS || names.some((n) => !n)) {
    return fail(400, `Send up to ${MAX_REFS} speaker names, each with one reference clip.`);
  }
  const refBytes: Uint8Array[] = [];
  let refSeconds = 0;
  for (const r of refs) {
    if (!(r instanceof File) || r.size === 0 || r.size > MAX_REF_BYTES || !audioExt(r.name, r.type)) {
      return fail(400, 'Each speaker reference must be a short audio clip under 256 KB.');
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    const secs = audioDurationSeconds(bytes);
    if (secs === null || secs > MAX_REF_SECONDS) {
      return fail(400, `Each speaker reference must be a readable clip of ${MAX_REF_SECONDS} seconds or less.`);
    }
    refBytes.push(bytes);
    refSeconds += secs;
  }
  if (file.size + refBytes.reduce((a, r) => a + r.byteLength, 0) > MAX_AUDIO_BYTES) return fail(413, TOO_BIG);

  // Billing follows audio length, not bytes, so bound the length before any OpenAI call.
  const audio = new Uint8Array(await file.arrayBuffer());
  const seconds = audioDurationSeconds(audio);
  if (seconds === null) return fail(415, 'Could not read the length of this audio. Try mp3, wav or a fresh recording.');
  if (seconds > MAX_AUDIO_SECONDS) return fail(413, `Audio must be ${MAX_AUDIO_SECONDS / 60} minutes or shorter.`);

  const gate = await check(req, 'transcribe');
  if (!gate.ok) return tooMany(gate);
  const reserved = seconds + refSeconds;
  const spend = await audioBudget.take(reserved);
  if (!spend.ok) return budgetSpent(spend);

  try {
    const upload = await toFile(Buffer.from(audio), `meeting.${ext}`, {
      type: file.type || `audio/${ext}`,
    });
    const references = refBytes.map((bytes, i) => `data:${audioMime(refs[i] as File)};base64,${Buffer.from(bytes).toString('base64')}`);
    // diarized_json is the only format that carries speaker labels; chunking is required past 30s.
    const res = (await openai().audio.transcriptions.create({
      model: TRANSCRIBE_MODEL,
      file: upload,
      response_format: 'diarized_json',
      chunking_strategy: 'auto',
      ...(names.length ? { known_speaker_names: names, known_speaker_references: references } : {}),
    })) as unknown as TranscriptionDiarized;

    // The header can understate the length; charge the budget what OpenAI actually processed.
    if (res.duration > seconds) await audioBudget.add(res.duration - seconds);
    const segments = normalizeSegments(res.segments ?? []);
    if (!segments.length) return fail(422, 'No speech was found in this audio.');
    const duration = res.duration || segments.at(-1)!.end;
    return Response.json({ segments, duration, speakers: speakerLabels(segments), rawSegments: res.segments.length });
  } catch (err) {
    return upstreamError(err);
  }
}
