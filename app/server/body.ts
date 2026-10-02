export type Capped = { ok: true; bytes: Uint8Array } | { ok: false; reason: 'too_large' | 'unreadable' };

/** Reads the body as a stream and stops at maxBytes, whatever content-length says. */
export async function readCapped(req: Request, maxBytes: number): Promise<Capped> {
  const declared = req.headers.get('content-length');
  if (declared !== null && !(Number(declared) <= maxBytes)) {
    await req.body?.cancel().catch(() => {});
    return { ok: false, reason: 'too_large' };
  }
  if (!req.body) return { ok: true, bytes: new Uint8Array(0) };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, bytes };
}
