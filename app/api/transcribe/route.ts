import { toFile } from 'openai';
import type { TranscriptionDiarized } from 'openai/resources/audio/transcriptions';
import { audioExt, FORM_OVERHEAD, MAX_AUDIO_BYTES, MAX_REF_BYTES, MAX_REFS } from '@/lib/limits';
import { normalizeSegments, speakerLabels } from '@/lib/transcript';
import { fail, openai, TRANSCRIBE_MODEL, upstreamError } from '@/app/server/openai';
import { check, tooMany } from '@/app/server/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TOO_BIG = `Audio must be 4 MB or smaller (about 8 minutes of a browser recording).`;

export async function POST(req: Request) {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_AUDIO_BYTES + FORM_OVERHEAD) return fail(413, TOO_BIG);
  if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
    return fail(400, 'Send the audio as multipart form data in a "file" field.');
  }

  let form: FormData;
  try {
    form = await req.formData();
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
  for (const r of refs) {
    if (!(r instanceof File) || r.size === 0 || r.size > MAX_REF_BYTES || !audioExt(r.name, r.type)) {
      return fail(400, 'Each speaker reference must be a short audio clip under 256 KB.');
    }
  }
  if (file.size + refs.reduce((a, r) => a + (r as File).size, 0) > MAX_AUDIO_BYTES) return fail(413, TOO_BIG);

  const gate = check(req, 'transcribe');
  if (!gate.ok) return tooMany(gate.retryAfter);

  try {
    const upload = await toFile(Buffer.from(await file.arrayBuffer()), `meeting.${ext}`, {
      type: file.type || `audio/${ext}`,
    });
    const references = await Promise.all(
      (refs as File[]).map(async (r) => `data:${r.type || 'audio/mpeg'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`),
    );
    // diarized_json is the only format that carries speaker labels; chunking is required past 30s.
    const res = (await openai().audio.transcriptions.create({
      model: TRANSCRIBE_MODEL,
      file: upload,
      response_format: 'diarized_json',
      chunking_strategy: 'auto',
      ...(names.length ? { known_speaker_names: names, known_speaker_references: references } : {}),
    })) as unknown as TranscriptionDiarized;

    const segments = normalizeSegments(res.segments ?? []);
    if (!segments.length) return fail(422, 'No speech was found in this audio.');
    const duration = res.duration || segments.at(-1)!.end;
    return Response.json({ segments, duration, speakers: speakerLabels(segments), rawSegments: res.segments.length });
  } catch (err) {
    return upstreamError(err);
  }
}
