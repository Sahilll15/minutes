import { ADD, PEEK, RESERVE, TAKE, type RedisLike } from '../app/server/redis.ts';

/** Emulates the four Lua scripts with a Map and a controllable clock. */
export function fakeRedis(clock = { now: 0 }) {
  const data = new Map<string, { v: number; exp: number | null }>();
  const calls: string[] = [];
  let failing = false;

  const get = (k: string) => {
    const e = data.get(k);
    if (e && e.exp !== null && e.exp <= clock.now) data.delete(k);
    return data.get(k);
  };
  const pttl = (k: string) => {
    const e = get(k);
    return !e ? -2 : e.exp === null ? -1 : e.exp - clock.now;
  };
  const set = (k: string, v: number, ttl?: number) => {
    const e = get(k);
    data.set(k, { v, exp: ttl !== undefined ? clock.now + ttl : (e?.exp ?? null) });
  };

  const redis: RedisLike = {
    async eval(script, keys, args) {
      if (failing) throw new Error('connection refused');
      const [k] = keys;
      const a = args.map(Number);
      if (script === TAKE) {
        calls.push('take');
        let c = get(k)?.v ?? 0;
        let ttl = pttl(k);
        if (c >= a[0]) {
          if (c > 0 && ttl < 0) set(k, c, (ttl = a[1]));
          return [0, c, ttl];
        }
        c += 1;
        set(k, c, ttl < 0 ? (ttl = a[1]) : undefined);
        return [1, c, ttl];
      }
      if (script === PEEK) {
        calls.push('peek');
        return [get(k)?.v ?? 0, pttl(k)];
      }
      if (script === RESERVE) {
        calls.push('reserve');
        const used = get(k)?.v ?? 0;
        if (used + a[0] > a[1]) return [0, used];
        set(k, used + a[0], a[2]);
        return [1, used + a[0]];
      }
      if (script === ADD) {
        calls.push('add');
        set(k, (get(k)?.v ?? 0) + a[0], a[1]);
        return get(k)!.v;
      }
      throw new Error('unknown script');
    },
  };

  return {
    redis,
    clock,
    calls,
    value: (k: string) => get(k)?.v,
    ttl: pttl,
    fail(on = true) {
      failing = on;
    },
  };
}
