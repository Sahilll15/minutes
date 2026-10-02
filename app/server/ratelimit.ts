const HOUR = 60 * 60 * 1000;
const SWEEP_EVERY = 60_000;

export type Limit = { limit: number; windowMs: number };
export type Verdict = { ok: true; remaining: number } | { ok: false; retryAfter: number };

/** Reads a non-negative integer env var. Anything malformed falls back to the default instead of disabling the limit. */
export function envInt(raw: string | undefined, fallback: number, min = 0) {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n >= min ? n : fallback;
}

const windowMs = envInt(process.env.RATE_LIMIT_WINDOW_MS, HOUR, 1000);

export const LIMITS = {
  transcribe: { limit: envInt(process.env.RATE_LIMIT_TRANSCRIBE, 3), windowMs },
  extract: { limit: envInt(process.env.RATE_LIMIT_EXTRACT, 5), windowMs },
} satisfies Record<string, Limit>;

/** Canonical key for an address: ports, zones and brackets stripped, IPv6 grouped by /64. */
export function normalizeIp(raw: string) {
  let ip = raw.trim().toLowerCase();
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'));
  ip = ip.replace(/%.*$/, '');

  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) ip = mapped[1];

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return ip.split('.').every((o) => Number(o) <= 255) ? ip.split('.').map(Number).join('.') : 'invalid';
  }
  if (!ip.includes(':') || !/^[0-9a-f:]+$/.test(ip)) return 'invalid';

  const halves = ip.split('::');
  if (halves.length > 2) return 'invalid';
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return 'invalid';
  const groups = [...head, ...Array(missing).fill('0'), ...tail];
  if (groups.some((g) => g.length === 0 || g.length > 4)) return 'invalid';
  // One subscriber usually owns a whole /64, so finer keys would let them rotate addresses.
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

// x-real-ip is overwritten by the platform proxy (Vercel). The leftmost x-forwarded-for
// entry is whatever the client sent, so only the last hop is used.
export function clientIp(req: Request) {
  const real = req.headers.get('x-real-ip');
  if (real?.trim()) return normalizeIp(real);
  const last = req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).at(-1);
  return last ? normalizeIp(last) : 'unknown';
}

type Entry = { hits: number[]; windowMs: number };

export function createLimiter(maxKeys = 10_000) {
  const buckets = new Map<string, Entry>();
  let lastSweep = 0;

  function sweep(now: number) {
    lastSweep = now;
    for (const [key, e] of buckets) {
      if (!e.hits.length || now - e.hits[e.hits.length - 1] >= e.windowMs) buckets.delete(key);
    }
  }

  function store(key: string, entry: Entry, now: number) {
    buckets.delete(key);
    buckets.set(key, entry);
    if (buckets.size <= maxKeys) return;
    if (now - lastSweep > SWEEP_EVERY) sweep(now);
    // Evict least recently touched keys one at a time; never wipe everyone's counters.
    while (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value!);
  }

  function live(key: string, windowMs: number, now: number) {
    return (buckets.get(key)?.hits ?? []).filter((t) => now - t < windowMs);
  }

  const retryAfter = (hits: number[], windowMs: number, now: number) =>
    Math.max(1, Math.ceil(((hits[0] ?? now) + windowMs - now) / 1000));

  return {
    hit(key: string, { limit, windowMs }: Limit, now = Date.now()): Verdict {
      const hits = live(key, windowMs, now);
      if (hits.length >= limit) {
        store(key, { hits, windowMs }, now);
        return { ok: false, retryAfter: retryAfter(hits, windowMs, now) };
      }
      hits.push(now);
      store(key, { hits, windowMs }, now);
      return { ok: true, remaining: limit - hits.length };
    },
    /** Seconds until the key may try again, or 0 when it is not limited. Does not count a hit. */
    blocked(key: string, { limit, windowMs }: Limit, now = Date.now()) {
      const hits = live(key, windowMs, now);
      return hits.length >= limit ? retryAfter(hits, windowMs, now) : 0;
    },
    size: () => buckets.size,
  };
}

/** A per-instance counter that resets at UTC midnight. */
export function createDailyBudget(limit: number, today = () => new Date().toISOString().slice(0, 10)) {
  let day = today();
  let used = 0;
  const roll = () => {
    const d = today();
    if (d !== day) {
      day = d;
      used = 0;
    }
  };
  return {
    take(amount = 1) {
      roll();
      if (used + amount > limit) return false;
      used += amount;
      return true;
    },
    /** Records usage learned after the fact, even past the limit. */
    add(amount: number) {
      roll();
      used += Math.max(0, amount);
    },
    used() {
      roll();
      return used;
    },
  };
}

const limiter = createLimiter();

export function check(req: Request, name: keyof typeof LIMITS) {
  return limiter.hit(`${name}:${clientIp(req)}`, LIMITS[name]);
}

export function isBlocked(req: Request, name: keyof typeof LIMITS) {
  return limiter.blocked(`${name}:${clientIp(req)}`, LIMITS[name]);
}

/** Audio seconds this instance may send for transcription per UTC day. */
export const audioBudget = createDailyBudget(envInt(process.env.DAILY_AUDIO_MINUTES, 120) * 60);

export function budgetSpent() {
  return Response.json(
    { error: 'This demo has used up its transcription budget for today. Try again tomorrow, or run it locally with your own key.' },
    { status: 503, headers: { 'retry-after': '3600' } },
  );
}

export function tooMany(retryAfter: number) {
  const minutes = Math.ceil(retryAfter / 60);
  return Response.json(
    {
      error: `Rate limit reached. This demo runs on my own API credits, so it allows a few meetings per hour. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    },
    { status: 429, headers: { 'retry-after': String(retryAfter) } },
  );
}
