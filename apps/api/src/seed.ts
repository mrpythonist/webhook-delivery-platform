/**
 * Seed script — registers demo endpoints against the demo-receiver service
 * and fires a batch of sample events so the dashboard has data to show.
 *
 * Usage:
 *   npm run seed
 *
 * Env:
 *   API_URL           API base URL            (default http://localhost:3001)
 *   DEMO_RECEIVER_URL demo-receiver base URL  (default http://localhost:3002,
 *                     use http://demo-receiver:3002 when run inside compose)
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const DEMO_RECEIVER_URL = process.env.DEMO_RECEIVER_URL ?? 'http://localhost:3002';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

interface RegisteredEndpoint {
  id: string;
  url: string;
  secret: string;
}

interface SeededEvent {
  type: string;
  eventId: string;
  deliveries: number;
}

async function main() {
  console.log(`Seeding against API ${API_URL} (demo-receiver ${DEMO_RECEIVER_URL})...\n`);

  const endpoints = [
    { path: '/ok', label: 'always succeeds (200 immediately)' },
    { path: '/slow', label: 'responds after 3s (still inside the 10s timeout)' },
    { path: '/flaky', label: 'fails twice, then succeeds — watch retries recover it' },
    { path: '/dead', label: 'always 500s — watch retries exhaust and mark it failed' },
  ];

  const registered = [];
  for (const ep of endpoints) {
    const created = await post<RegisteredEndpoint>('/api/endpoints', {
      url: `${DEMO_RECEIVER_URL}${ep.path}`,
      events: [], // empty = subscribed to all event types
      maxAttempts: 5,
      backoffBaseMs: 1000,
    });
    registered.push(created);
    console.log(`registered endpoint: ${created.url}`);
    console.log(`  -> ${ep.label}`);
    console.log(`  id=${created.id} secret=${String(created.secret).slice(0, 12)}...`);
  }

  console.log('\nFiring sample events (payment.succeeded, payment.failed, subscription.created, invoice.paid)...');
  const seeded = await post<{ seeded: SeededEvent[] }>('/api/events/seed', {});
  for (const s of seeded.seeded) {
    console.log(`  ${s.type}: event ${s.eventId}, ${s.deliveries} deliveries queued`);
  }

  console.log('\nDone. Open the dashboard and watch /flaky recover and /dead exhaust its retries.');
  console.log('Each endpoint gets 4 events x 4 endpoints = 16 deliveries; retries will add attempts over time.');
}

main().catch((err) => {
  console.error('seed failed:', err.message);
  console.error('Hint: is the API running and is DATABASE_URL/REDIS_URL reachable?');
  process.exit(1);
});
