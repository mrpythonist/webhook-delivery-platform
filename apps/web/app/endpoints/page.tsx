'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatTime, type Endpoint } from '../../lib/api';

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('');
  const [maxAttempts, setMaxAttempts] = useState('5');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEndpoints(await api<Endpoint[]>('/api/endpoints'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const parsedEvents = events
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const parsedMaxAttempts = Number.parseInt(maxAttempts, 10);
      if (!Number.isInteger(parsedMaxAttempts) || parsedMaxAttempts < 1) {
        throw new Error('Max attempts must be a positive integer');
      }
      await api('/api/endpoints', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim(), events: parsedEvents, maxAttempts: parsedMaxAttempts }),
      });
      setUrl('');
      setEvents('');
      setMaxAttempts('5');
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to register endpoint');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(ep: Endpoint) {
    await api(`/api/endpoints/${ep.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !ep.active }),
    });
    await refresh();
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this endpoint? Its deliveries will be deleted too.')) return;
    await api(`/api/endpoints/${id}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold tracking-tight">Endpoints</h2>

      {/* Register form */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h3 className="text-base font-semibold">Register a webhook endpoint</h3>
        <form onSubmit={register} className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="text-sm text-neutral-400" htmlFor="url">
              URL
            </label>
            <input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://example.com/webhooks"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-500"
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400" htmlFor="max-attempts">
              Max attempts
            </label>
            <input
              id="max-attempts"
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-sm text-neutral-400" htmlFor="events">
              Subscribed events (comma-separated; leave empty for all events)
            </label>
            <input
              id="events"
              value={events}
              onChange={(e) => setEvents(e.target.value)}
              placeholder="payment.succeeded, invoice.paid"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-500"
            />
          </div>
          <div className="flex items-center gap-3 md:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-50"
            >
              {saving ? 'Registering…' : 'Register endpoint'}
            </button>
            <span className="text-xs text-neutral-500">
              A signing secret is generated automatically if you don&apos;t provide one.
            </span>
            {formError && <p className="text-sm text-red-400">{formError}</p>}
          </div>
        </form>
      </section>

      {/* List */}
      <section>
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium">Events</th>
                <th className="px-4 py-3 font-medium">Max attempts</th>
                <th className="px-4 py-3 font-medium">Backoff base</th>
                <th className="px-4 py-3 font-medium">Registered</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {endpoints.map((ep) => (
                <tr key={ep.id}>
                  <td className="max-w-xs break-all px-4 py-3 font-mono text-xs">{ep.url}</td>
                  <td className="px-4 py-3 text-xs text-neutral-400">
                    {ep.events.length === 0 ? 'all events' : ep.events.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{ep.maxAttempts}</td>
                  <td className="px-4 py-3 text-neutral-400">{ep.backoffBaseMs}ms</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-400">
                    {formatTime(ep.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    <button
                      onClick={() => toggleActive(ep)}
                      className="mr-3 text-neutral-400 hover:text-neutral-100"
                    >
                      {ep.active ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => remove(ep.id)} className="text-red-400 hover:text-red-300">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && endpoints.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                    No endpoints registered yet.
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
