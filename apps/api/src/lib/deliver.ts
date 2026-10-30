export interface DeliverInput {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs?: number;
}

export interface DeliverResult {
  ok: boolean;
  statusCode?: number;
  /** Response body, truncated to 4KB. */
  body?: string;
  durationMs: number;
  error?: string;
}

const MAX_BODY = 4096;

/**
 * POSTs the webhook payload to a customer endpoint.
 * - 10s default timeout via AbortController (slow endpoints don't hang workers)
 * - Any network/DNS/TLS failure is captured as `error` (not thrown)
 * - `ok` is true only for 2xx responses
 */
export async function deliver({
  url,
  body,
  headers,
  timeoutMs = 10_000,
}: DeliverInput): Promise<DeliverResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    const durationMs = Date.now() - started;
    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      statusCode: res.status,
      body: text.slice(0, MAX_BODY),
      durationMs,
      error: ok ? undefined : `Unexpected HTTP status ${res.status}`,
    };
  } catch (err) {
    const durationMs = Date.now() - started;
    const e = err as Error & { name?: string; cause?: unknown };
    const error =
      e?.name === 'AbortError'
        ? `Request timed out after ${timeoutMs}ms`
        : (e?.message ?? 'Unknown network error');
    return { ok: false, durationMs, error };
  } finally {
    clearTimeout(timer);
  }
}
