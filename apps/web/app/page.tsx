'use client';

import { useCallback, useEffect, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import {
  api,
  endpointHost,
  formatTime,
  type DeliverySummary,
  type Endpoint,
  type Stats,
} from '../lib/api';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-sm text-neutral-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Test-event form
  const [eventType, setEventType] = useState('payment.succeeded');
  const [payloadText, setPayloadText] = useState(
    '{\n  "id": "evt_test_1",\n  "amount": 2499,\n  "currency": "usd"\n}',
  );
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, e, d] = await Promise.all([
        api<Stats>('/api/stats'),
        api<Endpoint[]>('/api/endpoints'),
        api<DeliverySummary[]>('/api/deliveries?take=20'),
      ]);
      setStats(s);
      setEndpoints(e);
      setDeliveries(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach the API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000); // live view of retries in progress
    return () => clearInterval(timer);
  }, [refresh]);

  async function sendTestEvent(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setSendResult(null);
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        throw new Error('Payload is not valid JSON');
      }
      const res = await api<{ deliveries: Array<{ id: string }> }>('/api/events', {
        method: 'POST',
        body: JSON.stringify({ type: eventType.trim(), payload }),
      });
      setSendResult(`Event queued — ${res.deliveries.length} deliveries created.`);
      await refresh();
    } catch (err) {
      setSendResult(err instanceof Error ? `Error: ${err.message}` : 'Failed to send event');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <p className="text-neutral-400">Loading dashboard…</p>;
  }

  if (error && !stats) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
        <p className="font-medium text-red-400">Could not reach the API</p>
        <p className="mt-1 text-sm text-neutral-400">{error}</p>
        <p className="mt-2 text-sm text-neutral-500">
          Make sure the stack is running (`docker compose up`) and NEXT_PUBLIC_API_URL points at the
          API (default http://localhost:3001).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total deliveries" value={String(stats?.total ?? 0)} />
        <StatCard label="Delivered" value={`${stats?.deliveredPct ?? 0}%`} sub={`${stats?.delivered ?? 0} delivered`} />
        <StatCard label="Failed" value={String(stats?.failed ?? 0)} sub="after exhausting retries" />
        <StatCard
          label="Avg attempts"
          value={(stats?.avgAttempts ?? 0).toFixed(1)}
          sub={`${stats?.queued ?? 0} queued · ${stats?.delivering ?? 0} delivering`}
        />
      </div>

      {/* Send test event */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-base font-semibold">Send test event</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Publishes an event and fans it out to every active subscribed endpoint.
        </p>
        <form onSubmit={sendTestEvent} className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm text-neutral-400" htmlFor="event-type">
              Event type
            </label>
            <input
              id="event-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-500"
              placeholder="payment.succeeded"
            />
          </div>
          <div className="md:row-span-2">
            <label className="text-sm text-neutral-400" htmlFor="payload">
              Payload (JSON)
            </label>
            <textarea
              id="payload"
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              rows={6}
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-500"
            />
          </div>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send event'}
            </button>
            {sendResult && <p className="text-sm text-neutral-400">{sendResult}</p>}
          </div>
        </form>
      </section>

      {/* Endpoints */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Endpoints</h2>
          <a href="/endpoints" className="text-sm text-neutral-400 hover:text-neutral-100">
            Manage endpoints →
          </a>
        </div>
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium">Events</th>
                <th className="px-4 py-3 font-medium">Max attempts</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {endpoints.map((ep) => (
                <tr key={ep.id}>
                  <td className="px-4 py-3 font-mono text-xs">{ep.url}</td>
                  <td className="px-4 py-3 text-neutral-400">
                    {ep.events.length === 0 ? 'all events' : ep.events.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{ep.maxAttempts}</td>
                  <td className="px-4 py-3">
                    <span className={ep.active ? 'text-green-400' : 'text-neutral-500'}>
                      {ep.active ? 'active' : 'disabled'}
                    </span>
                  </td>
                </tr>
              ))}
              {endpoints.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">
                    No endpoints registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent deliveries */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Recent deliveries</h2>
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Endpoint</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Attempts</th>
                <th className="px-4 py-3 font-medium">Last code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-neutral-900/50">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-400">
                    {formatTime(d.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{d.event.type}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                    {endpointHost(d.endpoint.url)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{d.attemptsMade}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                    {d.lastStatusCode ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/deliveries/${d.id}`}
                      className="text-xs text-neutral-400 hover:text-neutral-100"
                    >
                      Details →
                    </a>
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                    No deliveries yet — send a test event above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
