export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; maxDelayMs?: number; label?: string } = {}
): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 8000;
  const max = opts.maxDelayMs ?? 60000;
  let lastErr: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const status = e?.status ?? e?.code;
      const msg = String(e?.message ?? "");
      const retryable =
        status === 429 || status === 503 ||
        /RESOURCE_EXHAUSTED|UNAVAILABLE|quota|rate limit|resource exhausted/i.test(msg);
      if (!retryable || attempt === retries) throw e;

      const delay = Math.min(max, base * Math.pow(2, attempt)) + Math.random() * 1500;
      console.warn(
        `[${opts.label ?? "VERTEX"}] ${status ?? "error"} on attempt ${attempt + 1}/${retries + 1}; retrying in ${(delay / 1000).toFixed(1)}s`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}