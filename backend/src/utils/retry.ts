/**
 * Retry with exponential backoff.
 * Retries on network errors and 429/5xx HTTP responses.
 * Does NOT retry on 4xx (client errors) except 429.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status: number | undefined = err?.response?.status;
      // Don't retry client errors (except 429 Too Many Requests)
      if (status && status >= 400 && status < 500 && status !== 429) throw err;
      if (attempt === maxAttempts) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
