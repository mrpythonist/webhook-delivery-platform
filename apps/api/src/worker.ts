import { Worker, type Job } from 'bullmq';
import { prisma } from './db';
import { connection, QUEUE_NAME } from './queue';
import { deliver } from './lib/deliver';
import { sign } from './lib/sign';

interface DeliveryJobData {
  deliveryId: string;
}

async function processDelivery(job: Job<DeliveryJobData>): Promise<void> {
  const { deliveryId } = job.data;

  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true, event: true },
  });
  if (!delivery) {
    console.warn(`[worker] delivery ${deliveryId} not found, skipping`);
    return;
  }

  const { endpoint, event } = delivery;

  // Endpoint was deactivated or deleted mid-queue: fail fast, no retries.
  if (!endpoint.active) {
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: 'failed' },
    });
    return;
  }

  const attemptNo = delivery.attemptsMade + 1;
  const rawBody = JSON.stringify(event.payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = sign(endpoint.secret, ts, rawBody);

  await prisma.delivery.update({
    where: { id: deliveryId },
    data: { status: 'delivering', attemptsMade: attemptNo },
  });

  const result = await deliver({
    url: endpoint.url,
    body: rawBody,
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Event-Type': event.type,
      'X-Webhook-Delivery-Id': delivery.id,
      'X-Webhook-Timestamp': ts,
      'X-Webhook-Signature': signature,
    },
  });

  await prisma.deliveryAttempt.create({
    data: {
      deliveryId,
      attemptNo,
      statusCode: result.statusCode ?? null,
      responseBody: result.body ?? null,
      error: result.error ?? null,
      durationMs: result.durationMs,
      signature,
      signatureTs: ts,
    },
  });

  if (result.ok) {
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: 'delivered', lastStatusCode: result.statusCode },
    });
    return;
  }

  const exhausted = attemptNo >= endpoint.maxAttempts;
  await prisma.delivery.update({
    where: { id: deliveryId },
    data: {
      status: exhausted ? 'failed' : 'queued',
      lastStatusCode: result.statusCode ?? null,
    },
  });

  if (!exhausted) {
    // Throw so BullMQ applies exponential backoff and retries the job.
    throw new Error(result.error ?? `HTTP ${result.statusCode}`);
  }
  // Final attempt: job completes; the delivery is already marked failed.
  console.warn(
    `[worker] delivery ${deliveryId} exhausted ${attemptNo} attempts, marked failed`,
  );
}

const worker = new Worker<DeliveryJobData>(QUEUE_NAME, processDelivery, {
  connection,
  concurrency: 10,
});

worker.on('failed', (job, err) => {
  console.warn(`[worker] job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
});

worker.on('completed', (job) => {
  console.log(`[worker] job ${job.id} completed`);
});

worker.on('error', (err) => {
  console.error('[worker] error:', err);
});

async function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, shutting down gracefully...`);
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[worker] started (concurrency 10)');
