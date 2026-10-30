import express, { type Request, type Response } from 'express';

const app = express();
app.use(express.json());

/**
 * Demo "customer" webhook endpoints. Each one logs every hit so you can watch
 * the platform's retry behavior in real time.
 *
 *  POST /ok   -> 200 immediately (happy path)
 *  POST /slow -> 200 after a 3s delay (inside the platform's 10s timeout)
 *  POST /flaky -> 500 for the first 2 hits per delivery id, then 200
 *                 (demonstrates automatic retry recovery)
 *  POST /dead -> always 500 (demonstrates exhausted retries -> failed)
 */

// In-memory per-delivery hit counter for /flaky.
// NOTE: intentionally not production-grade — it resets on restart and does
// not work across multiple replicas. See README "Limitations".
const flakyHits = new Map<string, number>();

function logHit(req: Request, extra?: string) {
  const deliveryId = req.header('x-webhook-delivery-id') ?? '-';
  const eventType = req.header('x-webhook-event-type') ?? '-';
  const hasSignature = req.header('x-webhook-signature') ? 'yes' : 'no';
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path} ` +
      `delivery=${deliveryId} event=${eventType} signed=${hasSignature}` +
      (extra ? ` ${extra}` : ''),
  );
}

app.post('/ok', (req: Request, res: Response) => {
  logHit(req);
  res.status(200).json({ received: true });
});

app.post('/slow', (req: Request, res: Response) => {
  logHit(req);
  setTimeout(() => res.status(200).json({ received: true, note: 'slow responder' }), 3000);
});

app.post('/flaky', (req: Request, res: Response) => {
  const deliveryId = req.header('x-webhook-delivery-id') ?? 'unknown';
  const hits = (flakyHits.get(deliveryId) ?? 0) + 1;
  flakyHits.set(deliveryId, hits);
  logHit(req, `hit #${hits} for this delivery`);

  if (hits <= 2) {
    res.status(500).json({ error: 'transient failure (simulated)', hit: hits });
  } else {
    res.status(200).json({ received: true, note: `recovered on hit #${hits}` });
  }
});

app.post('/dead', (req: Request, res: Response) => {
  logHit(req);
  res.status(500).json({ error: 'boom' });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'demo-receiver', time: new Date().toISOString() });
});

const port = Number(process.env.PORT ?? 3002);
app.listen(port, () => {
  console.log(`[demo-receiver] listening on :${port}`);
});
