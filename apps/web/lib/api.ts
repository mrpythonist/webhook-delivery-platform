// API base URL. The dashboard fetches the API from the browser, so this
// must be reachable from the browser (default: local API on :3001).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface Endpoint {
  id: string;
  url: string;
  events: string[];
  secret: string;
  maxAttempts: number;
  backoffBaseMs: number;
  active: boolean;
  createdAt: string;
}

export interface DeliveryAttempt {
  id: string;
  deliveryId: string;
  attemptNo: number;
  statusCode: number | null;
  responseBody: string | null;
  error: string | null;
  durationMs: number;
  signature: string | null;
  signatureTs: string | null;
  createdAt: string;
}

export interface Delivery {
  id: string;
  eventId: string;
  endpointId: string;
  status: 'queued' | 'delivering' | 'delivered' | 'failed';
  attemptsMade: number;
  lastStatusCode: number | null;
  createdAt: string;
  updatedAt: string;
  endpoint?: Endpoint;
  event?: { id: string; type: string; payload: unknown; createdAt: string };
  attempts?: DeliveryAttempt[];
}

export type DeliverySummary = Omit<Delivery, 'endpoint' | 'event'> & {
  endpoint: { url: string };
  event: { type: string };
};

export interface Stats {
  total: number;
  delivered: number;
  failed: number;
  queued: number;
  delivering: number;
  avgAttempts: number;
  deliveredPct: number;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function endpointHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}
