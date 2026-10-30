import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe-style HMAC-SHA256 signature.
 *
 * Header value: `t=<unix_ts>,v1=<hex>` computed over `<ts>.<rawJsonBody>`
 * using the endpoint's secret. Receivers verify by recomputing the HMAC over
 * the timestamp and the exact raw request body they received.
 */
export function sign(secret: string, timestamp: string, rawBody: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestamp}.${rawBody}`);
  return `t=${timestamp},v1=${hmac.digest('hex')}`;
}

const SIGNATURE_RE = /^t=(\d+),v1=([0-9a-f]{64})$/;

/**
 * Verifies a signature header produced by `sign`. Returns false on malformed
 * headers, mismatched HMAC, or timestamps outside the tolerance window
 * (replay protection).
 */
export function verify(
  secret: string,
  rawBody: string,
  header: string | undefined,
  toleranceSec = 300,
): boolean {
  if (!header) return false;
  const m = SIGNATURE_RE.exec(header.trim());
  if (!m) return false;
  const ts = m[1];
  const expected = sign(secret, ts, rawBody);

  const a = Buffer.from(expected);
  const b = Buffer.from(header.trim());
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - Number.parseInt(ts, 10)) <= toleranceSec;
}
