// Shared network helper: every game file goes through here so a flaky connection gets a few
// sensible retries before the loading screen offers a Retry button. Same-URL requests made
// at the same time share one download (islands share their ground tileset, for example).
const inflight = new Map();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch + parse with retries. kind: 'json' | 'text' | 'blob'. cache defaults to revalidate (cheap 304s, never stale). */
export function fetchRetry(url, { kind = 'json', tries = 3, cache = 'no-cache', onTry } = {}) {
  const key = `${kind}|${url}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, { cache });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        return await (kind === 'json' ? res.json() : kind === 'blob' ? res.blob() : res.text());
      } catch (err) {
        lastErr = err;
        onTry?.(i + 1, err);
        if (i < tries - 1) await wait(350 * 2 ** i);   // 350 ms, 700 ms
      }
    }
    throw lastErr;
  })();
  inflight.set(key, p);
  p.then(() => inflight.delete(key), () => inflight.delete(key));
  return p;
}
