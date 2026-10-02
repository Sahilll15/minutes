export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
/** Multipart framing on top of the file itself. */
export const FORM_OVERHEAD = 64 * 1024;
export const MAX_REF_BYTES = 256 * 1024;
export const MAX_REFS = 4;
export const MAX_SEGMENTS = 600;
export const MAX_TRANSCRIPT_CHARS = 60_000;
export const MAX_EXTRACT_BODY = 256 * 1024;

export const AUDIO_EXT = ['mp3', 'mp4', 'm4a', 'mpeg', 'mpga', 'wav', 'webm', 'ogg', 'flac'];

export function audioExt(name: string, type: string) {
  const fromName = name.split('.').pop()?.toLowerCase() ?? '';
  if (AUDIO_EXT.includes(fromName)) return fromName;
  const sub = type.split(';')[0].split('/')[1]?.toLowerCase() ?? '';
  const map: Record<string, string> = { mpeg: 'mp3', 'x-m4a': 'm4a', 'x-wav': 'wav', wave: 'wav', aac: 'm4a' };
  const ext = map[sub] ?? sub;
  return AUDIO_EXT.includes(ext) ? ext : null;
}

export const MAX_AUDIO_SECONDS = 20 * 60;
export const MAX_REF_SECONDS = 12;
