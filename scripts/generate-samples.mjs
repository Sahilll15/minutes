// One-off dev script: node --env-file=.env.local scripts/generate-samples.mjs [id...]
// Renders each sample script with gpt-4o-mini-tts, one voice per speaker, into public/samples/<id>.mp3.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import OpenAI from 'openai';

const root = path.resolve(import.meta.dirname, '..');
const client = new OpenAI();
const only = process.argv.slice(2);

const files = readdirSync(path.join(root, 'samples')).filter((f) => f.endsWith('.json'));

for (const file of files) {
  const script = JSON.parse(readFileSync(path.join(root, 'samples', file), 'utf8'));
  if (only.length && !only.includes(script.id)) continue;
  const work = mkdtempSync(path.join(tmpdir(), `minutes-${script.id}-`));
  const parts = [];

  for (const [i, [speaker, text]] of script.lines.entries()) {
    const { voice, instructions } = script.speakers[speaker];
    const res = await client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice,
      input: text,
      instructions,
      response_format: 'wav',
    });
    const out = path.join(work, `${String(i).padStart(3, '0')}.wav`);
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    parts.push(out);
    console.log(`${script.id} ${i + 1}/${script.lines.length} ${speaker}`);
  }

  // Normalize every clip to one format and add a short pause after each turn.
  const filters = parts
    .map((_, i) => `[${i}:a]aresample=24000,aformat=channel_layouts=mono,apad=pad_dur=0.45[a${i}]`)
    .join(';');
  const concat = parts.map((_, i) => `[a${i}]`).join('') + `concat=n=${parts.length}:v=0:a=1[out]`;
  const target = path.join(root, 'public', 'samples', `${script.id}.mp3`);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    ...parts.flatMap((p) => ['-i', p]),
    '-filter_complex', `${filters};${concat}`,
    '-map', '[out]', '-ac', '1', '-b:a', '64k', target,
  ]);

  // Known-speaker reference clips (2 to 10 s each) let diarization return real names.
  mkdirSync(path.join(root, 'public', 'samples', 'refs'), { recursive: true });
  for (const speaker of Object.keys(script.speakers)) {
    const idx = script.lines.findIndex(([s, t]) => s === speaker && t.split(' ').length >= 12);
    const pick = idx >= 0 ? idx : script.lines.findIndex(([s]) => s === speaker);
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', parts[pick], '-t', '8', '-ac', '1', '-ar', '24000', '-b:a', '48k',
      path.join(root, 'public', 'samples', 'refs', `${script.id}-${speaker.toLowerCase()}.mp3`),
    ]);
  }

  const txt = script.lines.map(([s, t]) => `${s}: ${t}`).join('\n\n');
  writeFileSync(path.join(root, 'public', 'samples', `${script.id}.txt`), `${script.title} (${script.date})\n\n${txt}\n`);
  rmSync(work, { recursive: true, force: true });
  console.log(`wrote ${target}`);
}
