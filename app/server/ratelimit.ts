type Hits = number[];

const buckets = new Map<string, Hits>();
const MAX_KEYS = 10_000;

export type Limit = { limit: number; windowMs: number };

const WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60 * 60 * 1000);

export const LIMITS = {
  transcribe: { limit: Number(process.env.RATE_LIMIT_TRANSCRIBE ?? 3), windowMs: WINDOW },
  extract: { limit: Number(process.env.RATE_LIMIT_EXTRACT ?? 5), windowMs: WINDOW },
} satisfies Record<string, Limit>;

export function clientIp(req: Request) {
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  // The leftmost entry is whatever the client sent; the last one was added by our proxy.
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const last = forwarded.split(',').map((s) => s.trim()).filter(Boolean).at(-1);
    if (last) return last;
  }
  return 'unknown';
}

export function check(req: Request, name: keyof typeof LIMITS) {
  const { limit, windowMs } = LIMITS[name];
  const key = `${name}:${clientIp(req)}`;
  const now = Date.now();

  if (buckets.size > MAX_KEYS) buckets.clear();

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    const retryAfter = Math.ceil(((hits[0] ?? now) + windowMs - now) / 1000);
    buckets.set(key, hits);
    return { ok: false as const, retryAfter };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true as const, remaining: limit - hits.length };
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
