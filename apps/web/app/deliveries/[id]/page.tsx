'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import StatusBadge from '../../../components/StatusBadge';
import { api, formatTime, type Delivery } from '../../../lib/api';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

export default function DeliveryDetail() {
  const params = useParams<{ id: string }>();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Delivery>(`/api/deliveries/${params.id}`)
      .then(setDelivery)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load delivery'));
  }, [params.id]);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!delivery) return <p className="text-neutral-400">Loading delivery…</p>;

  const attempts = delivery.attempts ?? [];
  const latestWithSignature = [...attempts].reverse().find((a) => a.signature);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <a href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
            ← Back to dashboard
          </a>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Delivery detail</h2>
        </div>
        <StatusBadge status={delivery.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Event type">
          <span className="font-mono text-xs">{delivery.event?.type}</span>
        </Field>
        <Field label="Endpoint">
          <span className="font-mono text-xs">{delivery.endpoint?.url}</span>
        </Field>
        <Field label="Attempts / Last status code">
          {delivery.attemptsMade} attempts · {delivery.lastStatusCode ?? '—'}
        </Field>
        <Field label="Created">
          <span className="text-neutral-400">{formatTime(delivery.createdAt)}</span>
        </Field>
        <Field label="Last updated">
          <span className="text-neutral-400">{formatTime(delivery.updatedAt)}</span>
        </Field>
        <Field label="Delivery ID">
          <span className="font-mono text-xs text-neutral-400">{delivery.id}</span>
        </Field>
      </div>

      {/* Event payload */}
      <section>
        <h3 className="mb-2 text-base font-semibold">Event payload</h3>
        <pre className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs leading-relaxed text-neutral-300">
          {JSON.stringify(delivery.event?.payload ?? {}, null, 2)}
        </pre>
      </section>

      {/* Signature headers */}
      <section>
        <h3 className="mb-2 text-base font-semibold">Signature headers sent</h3>
        <p className="mb-2 text-sm text-neutral-500">
          Each attempt is signed Stripe-style: <code className="font-mono">t=&lt;unix_ts&gt;,v1=&lt;hex&gt;</code>{' '}
          computed as HMAC-SHA256(secret, <code className="font-mono">&lt;ts&gt;.&lt;raw_body&gt;</code>).
        </p>
        {latestWithSignature ? (
          <div className="overflow-hidden rounded-xl border border-neutral-800">
            <table className="w-full text-left font-mono text-xs">
              <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                <tr>
                  <td className="px-4 py-2 text-neutral-500">X-Webhook-Signature</td>
                  <td className="break-all px-4 py-2">{latestWithSignature.signature}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-neutral-500">X-Webhook-Timestamp</td>
                  <td className="px-4 py-2">{latestWithSignature.signatureTs}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-neutral-500">X-Webhook-Delivery-Id</td>
                  <td className="px-4 py-2">{delivery.id}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-neutral-500">X-Webhook-Event-Type</td>
                  <td className="px-4 py-2">{delivery.event?.type}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No attempts recorded yet.</p>
        )}
      </section>

      {/* Attempts timeline */}
      <section>
        <h3 className="mb-2 text-base font-semibold">Attempt timeline</h3>
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Status code</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Response / error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-mono text-xs">{a.attemptNo}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-400">
                    {formatTime(a.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {a.statusCode ?? <span className="text-neutral-500">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">{a.durationMs}ms</td>
                  <td className="max-w-md px-4 py-3">
                    {a.error && <div className="text-xs text-red-400">{a.error}</div>}
                    {a.responseBody && (
                      <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-neutral-400">
                        {a.responseBody.slice(0, 300)}
                        {a.responseBody.length > 300 ? '…' : ''}
                      </pre>
                    )}
                    {!a.error && !a.responseBody && (
                      <span className="text-xs text-neutral-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {attempts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    No attempts yet — the worker has not picked up this delivery.
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
