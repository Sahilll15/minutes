import { Redis } from '@upstash/redis';

/** The one command this module needs, so tests can pass a fake. */
export type RedisLike = { eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown> };

export type Take = { ok: boolean; remaining: number; resetAt: number };

// The first counted hit opens the window. Over the limit nothing is incremented.
export const TAKE = `
local limit = tonumber(ARGV[1])
local win = tonumber(ARGV[2])
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
local ttl = redis.call('PTTL', KEYS[1])
if c >= limit then
  if c > 0 and ttl < 0 then redis.call('PEXPIRE', KEYS[1], win); ttl = win end
  return {0, c, ttl}
end
c = redis.call('INCR', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], win); ttl = win end
return {1, c, ttl}`;

export const PEEK = `
return {tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('PTTL', KEYS[1])}`;

export const RESERVE = `
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local amount = tonumber(ARGV[1])
if used + amount > tonumber(ARGV[2]) then return {0, used} end
used = redis.call('INCRBY', KEYS[1], amount)
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return {1, used}`;

export const ADD = `
local used = redis.call('INCRBY', KEYS[1], ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return used`;

const BUDGET_TTL_MS = 2 * 24 * 60 * 60 * 1000;

let client: RedisLike | null | undefined;

/** Null when the KV env vars are missing, which means the in-memory fallback is used. */
export function redisFromEnv(): RedisLike | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token, retry: { retries: 1, backoff: () => 150 }, signal: () => AbortSignal.timeout(4000) }) : null;
  return client;
}

const num = (v: unknown) => Number(v) || 0;

export async function take(redis: RedisLike, key: string, limit: number, windowMs: number, now = Date.now()): Promise<Take> {
  const [ok, count, ttl] = (await redis.eval(TAKE, [key], [limit, windowMs])) as unknown[];
  return { ok: num(ok) === 1, remaining: Math.max(0, limit - num(count)), resetAt: now + Math.max(0, num(ttl)) };
}

/** Reads the counter without counting a hit. */
export async function peek(redis: RedisLike, key: string, limit: number, now = Date.now()): Promise<Take> {
  const [count, ttl] = (await redis.eval(PEEK, [key], [])) as unknown[];
  const live = num(ttl) > 0 ? num(count) : 0;
  return { ok: live < limit, remaining: Math.max(0, limit - live), resetAt: live ? now + num(ttl) : now };
}

/** Adds amount to a daily total only if it stays within limit. */
export async function reserve(redis: RedisLike, key: string, amount: number, limit: number) {
  const [ok, used] = (await redis.eval(RESERVE, [key], [amount, limit, BUDGET_TTL_MS])) as unknown[];
  return { ok: num(ok) === 1, used: num(used) };
}

/** Records usage learned after the fact, even past the limit. */
export async function charge(redis: RedisLike, key: string, amount: number) {
  return num(await redis.eval(ADD, [key], [amount, BUDGET_TTL_MS]));
}

export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
