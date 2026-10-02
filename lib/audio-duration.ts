/** Reads duration from the container without decoding, or null if unknown. A crafted file can still lie. */
export function audioDurationSeconds(b: Uint8Array): number | null {
  try {
    const d = sniff(b);
    return d !== null && Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

function sniff(b: Uint8Array) {
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return wav(b);
  if (ascii(b, 0, 4) === 'fLaC') return flac(b);
  if (ascii(b, 0, 4) === 'OggS') return ogg(b);
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return matroska(b);
  if (ascii(b, 4, 4) === 'ftyp') return mp4(b);
  return mp3(b);
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

function wav(b: Uint8Array) {
  const v = view(b);
  let byteRate = 0;
  for (let at = 12; at + 8 <= b.length; ) {
    const id = ascii(b, at, 4);
    const size = v.getUint32(at + 4, true);
    if (id === 'fmt ') {
      const format = v.getUint16(at + 8, true);
      const channels = v.getUint16(at + 10, true);
      const rate = v.getUint32(at + 12, true);
      const bits = v.getUint16(at + 22, true);
      // Only PCM and float, where the byte rate is fixed by the format fields.
      if (format !== 1 && format !== 3 && format !== 0xfffe) return null;
      byteRate = (rate * channels * bits) / 8;
    } else if (id === 'data') {
      return byteRate > 0 ? (b.length - at - 8) / byteRate : null;
    }
    at += 8 + size + (size & 1);
  }
  return null;
}

function flac(b: Uint8Array) {
  if ((b[4] & 0x7f) !== 0) return null;
  const s = b.subarray(8, 8 + 34);
  const rate = (s[10] << 12) | (s[11] << 4) | (s[12] >> 4);
  const samples = (s[13] & 0x0f) * 2 ** 32 + (((s[14] << 24) | (s[15] << 16) | (s[16] << 8) | s[17]) >>> 0);
  return rate > 0 && samples > 0 ? samples / rate : null;
}

function ogg(b: Uint8Array) {
  const v = view(b);
  const segs = b[26];
  const packet = 27 + segs;
  let rate = 0;
  let preSkip = 0;
  if (ascii(b, packet, 8) === 'OpusHead') {
    rate = 48_000;
    preSkip = v.getUint16(packet + 10, true);
  } else if (b[packet] === 1 && ascii(b, packet + 1, 6) === 'vorbis') {
    rate = v.getUint32(packet + 12, true);
  } else {
    return null;
  }
  let granule = -1;
  for (let at = 0; at + 27 <= b.length; ) {
    if (ascii(b, at, 4) !== 'OggS') break;
    const g = v.getBigInt64(at + 6, true);
    if (g >= BigInt(0)) granule = Math.max(granule, Number(g));
    const n = b[at + 26];
    let body = 0;
    for (let i = 0; i < n; i++) body += b[at + 27 + i];
    at += 27 + n + body;
  }
  return granule > 0 && rate > 0 ? Math.max(0, granule - preSkip) / rate : null;
}

const MP3_BITRATES = {
  v1l1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  v1l2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  v1l3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2l1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  v2l23: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as Record<number, number[]>;

export function mp3Frame(b: Uint8Array, at: number) {
  if (at + 4 > b.length || b[at] !== 0xff || (b[at + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[at + 1] >> 3) & 3;
  const layer = (b[at + 1] >> 1) & 3;
  const br = b[at + 2] >> 4;
  const sr = (b[at + 2] >> 2) & 3;
  if (version === 1 || layer === 0 || br === 0 || br === 15 || sr === 3) return null;
  const v1 = version === 3;
  const table = v1 ? (layer === 3 ? MP3_BITRATES.v1l1 : layer === 2 ? MP3_BITRATES.v1l2 : MP3_BITRATES.v1l3) : layer === 3 ? MP3_BITRATES.v2l1 : MP3_BITRATES.v2l23;
  const bitrate = table[br] * 1000;
  const rate = MP3_RATES[version][sr];
  const pad = (b[at + 2] >> 1) & 1;
  if (layer === 3) return { length: (Math.floor((12 * bitrate) / rate) + pad) * 4, samples: 384, rate };
  const samples = layer === 2 ? 1152 : v1 ? 1152 : 576;
  return { length: Math.floor(((samples / 8) * bitrate) / rate) + pad, samples, rate };
}

/** Walks every MPEG audio frame, so a lying Xing header or bitrate does not matter. */
function mp3(b: Uint8Array) {
  let at = 0;
  if (ascii(b, 0, 3) === 'ID3') {
    at = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) + (b[5] & 0x10 ? 10 : 0);
  }
  const start = at;
  let seconds = 0;
  let covered = 0;
  while (at + 4 <= b.length) {
    const f = mp3Frame(b, at);
    // Random bytes often look like one frame header; require the next frame to line up too.
    const next = f && f.length >= 4 ? at + f.length : -1;
    const chained = next >= b.length || (next > 0 && mp3Frame(b, next)?.rate === f!.rate);
    if (!f || next < 0 || !chained) {
      at++;
      continue;
    }
    seconds += f.samples / f.rate;
    covered += f.length;
    at = next;
  }
  return covered > 0 && covered >= (b.length - start) / 2 ? seconds : null;
}

type Box = { type: string; start: number; end: number };

function boxes(b: Uint8Array, start: number, end: number): Box[] {
  const v = view(b);
  const out: Box[] = [];
  for (let at = start; at + 8 <= end; ) {
    let size = v.getUint32(at);
    let header = 8;
    if (size === 1) {
      size = Number(v.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header) break;
    out.push({ type: ascii(b, at + 4, 4), start: at + header, end: Math.min(at + size, end) });
    at += size;
  }
  return out;
}

const child = (b: Uint8Array, box: Box | undefined, type: string) => (box ? boxes(b, box.start, box.end).find((x) => x.type === type) : undefined);

function mp4(b: Uint8Array) {
  const v = view(b);
  const top = boxes(b, 0, b.length);
  const moov = top.find((x) => x.type === 'moov');
  const mvhd = child(b, moov, 'mvhd');
  if (mvhd) {
    const v1 = b[mvhd.start] === 1;
    const scale = v.getUint32(mvhd.start + (v1 ? 20 : 12));
    const dur = v1 ? Number(v.getBigUint64(mvhd.start + 24)) : v.getUint32(mvhd.start + 16);
    if (scale > 0 && dur > 0 && dur !== 0xffffffff) return dur / scale;
  }

  // Fragmented files (Safari's recorder) keep duration in the fragments instead.
  const mdhd = child(b, child(b, child(b, moov, 'trak'), 'mdia'), 'mdhd');
  if (!mdhd) return null;
  const scale = v.getUint32(mdhd.start + (b[mdhd.start] === 1 ? 20 : 12));
  const trex = child(b, child(b, moov, 'mvex'), 'trex');
  const trexDefault = trex ? v.getUint32(trex.start + 12) : 0;
  let ticks = 0;
  for (const moof of top.filter((x) => x.type === 'moof')) {
    for (const traf of boxes(b, moof.start, moof.end).filter((x) => x.type === 'traf')) {
      const tfhd = child(b, traf, 'tfhd');
      let fallback = trexDefault;
      if (tfhd) {
        const flags = v.getUint32(tfhd.start) & 0xffffff;
        let at = tfhd.start + 8;
        if (flags & 0x01) at += 8;
        if (flags & 0x02) at += 4;
        if (flags & 0x08) fallback = v.getUint32(at);
      }
      for (const trun of boxes(b, traf.start, traf.end).filter((x) => x.type === 'trun')) {
        const flags = v.getUint32(trun.start) & 0xffffff;
        const count = v.getUint32(trun.start + 4);
        let at = trun.start + 8 + (flags & 0x01 ? 4 : 0) + (flags & 0x04 ? 4 : 0);
        const per = [0x100, 0x200, 0x400, 0x800].filter((f) => flags & f).length * 4;
        if (!(flags & 0x100)) {
          ticks += count * fallback;
          continue;
        }
        for (let i = 0; i < count && at + 4 <= trun.end; i++, at += per) ticks += v.getUint32(at);
      }
    }
  }
  return scale > 0 && ticks > 0 ? ticks / scale : null;
}

function vint(b: Uint8Array, at: number, keepMarker: boolean) {
  const first = b[at];
  if (first === undefined || first === 0) return null;
  const len = Math.clz32(first) - 23;
  if (at + len > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> len);
  let allOnes = value === (0xff >> len);
  for (let i = 1; i < len; i++) {
    value = value * 256 + b[at + i];
    if (b[at + i] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: !keepMarker && allOnes };
}

const SEGMENT = 0x18538067;
const CLUSTER = 0x1f43b675;
const INFO = 0x1549a966;
const BLOCK_GROUP = 0xa0;
const ENTERED = new Set([SEGMENT, CLUSTER, INFO, BLOCK_GROUP]);

/** WebM from MediaRecorder has no Duration element, so fall back to the last block timestamp. */
function matroska(b: Uint8Array) {
  const v = view(b);
  let scale = 1_000_000;
  let declared = 0;
  let cluster = 0;
  let last = -1;
  for (let at = 0; at < b.length; ) {
    const id = vint(b, at, true);
    if (!id) break;
    const size = vint(b, at + id.len, false);
    if (!size) break;
    const data = at + id.len + size.len;
    if (ENTERED.has(id.value)) {
      at = data;
      continue;
    }
    if (size.unknown) return null;
    const end = data + size.value;
    if (id.value === 0x2ad7b1) scale = uint(b, data, size.value);
    else if (id.value === 0x4489) declared = size.value === 4 ? v.getFloat32(data) : v.getFloat64(data);
    else if (id.value === 0xe7) cluster = uint(b, data, size.value);
    else if ((id.value === 0xa3 || id.value === 0xa1) && end <= b.length) {
      const track = vint(b, data, false);
      if (track) last = Math.max(last, cluster + v.getInt16(data + track.len));
    }
    at = end;
  }
  if (declared > 0) return (declared * scale) / 1e9;
  return last >= 0 ? (last * scale) / 1e9 : null;
}

function uint(b: Uint8Array, at: number, n: number) {
  let x = 0;
  for (let i = 0; i < n; i++) x = x * 256 + b[at + i];
  return x;
}
