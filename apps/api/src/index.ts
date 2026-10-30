import { randomBytes } from 'node:crypto';
import express from 'express';
import { prisma } from './db';
import { connection } from './queue';
import { publishEvent } from './lib/publish';

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseEvents(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((e) => typeof e === 'string')) return null;
  return value;
}

const SAMPLE_EVENTS: Array<{ type: string; payload: Record<string, unknown> }> = [
  {
    type: 'payment.succeeded',
    payload: {
      id: 'evt_1p2q3r4s5t',
      amount: 4999,
      currency: 'usd',
      customer: 'cus_9f8e7d6c5b',
      payment_method: 'card_visa_4242',
      created: Math.floor(Date.now() / 1000),
    },
  },
  {
    type: 'payment.failed',
    payload: {
      id: 'evt_6u5v4w3x2y',
      amount: 1299,
      currency: 'usd',
      customer: 'cus_1a2b3c4d5e',
      failure_code: 'card_declined',
      failure_message: 'Your card was declined.',
      created: Math.floor(Date.now() / 1000),
    },
  },
  {
    type: 'subscription.created',
    payload: {
      id: 'evt_7z8y9x0w1v',
      subscription: 'sub_abc123xyz',
      customer: 'cus_9f8e7d6c5b',
      plan: 'pro_monthly',
      status: 'trialing',
      trial_end: Math.floor(Date.now() / 1000) + 14 * 24 * 3600,
      created: Math.floor(Date.now() / 1000),
    },
  },
  {
    type: 'invoice.paid',
    payload: {
      id: 'evt_2b3c4d5e6f',
      invoice: 'in_1H2G3F4E5D',
      customer: 'cus_1a2b3c4d5e',
      total: 4999,
      currency: 'usd',
      hosted_invoice_url: 'https://example.com/invoices/in_1H2G3F4E5D',
      created: Math.floor(Date.now() / 1000),
    },
  },
];

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'webhook-platform-api', time: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

app.post('/api/endpoints', async (req, res) => {
  const { url, events, secret, maxAttempts, backoffBaseMs } = req.body ?? {};

  if (!isHttpUrl(url)) {
    return res.status(400).json({ error: 'url must be a valid http(s) URL' });
  }
  const parsedEvents = parseEvents(events);
  if (parsedEvents === null) {
    return res.status(400).json({ error: 'events must be an array of strings (empty = all events)' });
  }
  if (maxAttempts !== undefined && (!Number.isInteger(maxAttempts) || maxAttempts < 1)) {
    return res.status(400).json({ error: 'maxAttempts must be a positive integer' });
  }
  if (backoffBaseMs !== undefined && (!Number.isInteger(backoffBaseMs) || backoffBaseMs < 0)) {
    return res.status(400).json({ error: 'backoffBaseMs must be a non-negative integer (ms)' });
  }

  const endpoint = await prisma.endpoint.create({
    data: {
      url,
      events: parsedEvents,
      secret:
        typeof secret === 'string' && secret.length > 0
          ? secret
          : randomBytes(32).toString('hex'),
      maxAttempts: maxAttempts ?? 5,
      backoffBaseMs: backoffBaseMs ?? 1000,
    },
  });
  res.status(201).json(endpoint);
});

app.get('/api/endpoints', async (_req, res) => {
  const endpoints = await prisma.endpoint.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(endpoints);
});

app.patch('/api/endpoints/:id', async (req, res) => {
  const { url, events, secret, maxAttempts, backoffBaseMs, active } = req.body ?? {};
  const data: Record<string, unknown> = {};

  if (url !== undefined) {
    if (!isHttpUrl(url)) return res.status(400).json({ error: 'url must be a valid http(s) URL' });
    data.url = url;
  }
  if (events !== undefined) {
    const parsed = parseEvents(events);
    if (parsed === null) return res.status(400).json({ error: 'events must be an array of strings' });
    data.events = parsed;
  }
  if (secret !== undefined) {
    if (typeof secret !== 'string' || secret.length === 0) {
      return res.status(400).json({ error: 'secret must be a non-empty string' });
    }
    data.secret = secret;
  }
  if (maxAttempts !== undefined) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      return res.status(400).json({ error: 'maxAttempts must be a positive integer' });
    }
    data.maxAttempts = maxAttempts;
  }
  if (backoffBaseMs !== undefined) {
    if (!Number.isInteger(backoffBaseMs) || backoffBaseMs < 0) {
      return res.status(400).json({ error: 'backoffBaseMs must be a non-negative integer (ms)' });
    }
    data.backoffBaseMs = backoffBaseMs;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'active must be a boolean' });
    data.active = active;
  }

  try {
    const endpoint = await prisma.endpoint.update({ where: { id: req.params.id }, data });
    res.json(endpoint);
  } catch {
    res.status(404).json({ error: 'endpoint not found' });
  }
});

app.delete('/api/endpoints/:id', async (req, res) => {
  try {
    await prisma.endpoint.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'endpoint not found' });
  }
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

app.post('/api/events', async (req, res) => {
  const { type, payload } = req.body ?? {};
  if (typeof type !== 'string' || type.length === 0) {
    return res.status(400).json({ error: 'type must be a non-empty string' });
  }
  if (typeof payload !== 'object' || payload === null) {
    return res.status(400).json({ error: 'payload must be a JSON object' });
  }

  const { event, deliveries } = await publishEvent(type, payload);
  res.status(201).json({
    event,
    deliveries: deliveries.map((d) => ({ id: d.id, endpointId: d.endpointId, status: d.status })),
  });
});

app.post('/api/events/seed', async (_req, res) => {
  const results = [];
  for (const sample of SAMPLE_EVENTS) {
    const { event, deliveries } = await publishEvent(sample.type, sample.payload);
    results.push({ type: sample.type, eventId: event.id, deliveries: deliveries.length });
  }
  res.status(201).json({ seeded: results });
});

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['queued', 'delivering', 'delivered', 'failed'] as const;

app.get('/api/deliveries', async (req, res) => {
  const { status, endpointId } = req.query;
  const take = Math.min(Math.max(Number.parseInt(String(req.query.take ?? '50'), 10) || 50, 1), 200);

  if (status !== undefined && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const deliveries = await prisma.delivery.findMany({
    where: {
      ...(status ? { status: String(status) } : {}),
      ...(endpointId ? { endpointId: String(endpointId) } : {}),
    },
    include: {
      endpoint: { select: { url: true } },
      event: { select: { type: true } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
  res.json(deliveries);
});

app.get('/api/deliveries/:id', async (req, res) => {
  const delivery = await prisma.delivery.findUnique({
    where: { id: req.params.id },
    include: {
      endpoint: true,
      event: true,
      attempts: { orderBy: { attemptNo: 'asc' } },
    },
  });
  if (!delivery) return res.status(404).json({ error: 'delivery not found' });
  res.json(delivery);
});

// ---------------------------------------------------------------------------
// Stats (powers the dashboard cards)
// ---------------------------------------------------------------------------

app.get('/api/stats', async (_req, res) => {
  const [total, delivered, failed, queued, delivering, avg] = await Promise.all([
    prisma.delivery.count(),
    prisma.delivery.count({ where: { status: 'delivered' } }),
    prisma.delivery.count({ where: { status: 'failed' } }),
    prisma.delivery.count({ where: { status: 'queued' } }),
    prisma.delivery.count({ where: { status: 'delivering' } }),
    prisma.delivery.aggregate({ _avg: { attemptsMade: true } }),
  ]);

  res.json({
    total,
    delivered,
    failed,
    queued,
    delivering,
    avgAttempts: avg._avg.attemptsMade ?? 0,
    deliveredPct: total === 0 ? 0 : Math.round((delivered / total) * 1000) / 10,
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT ?? 3001);

const server = app.listen(port, () => {
  console.log(`[api] listening on :${port}`);
});

async function shutdown(signal: string) {
  console.log(`[api] received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
