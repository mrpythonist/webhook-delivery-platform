import IORedis from 'ioredis';
import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

// BullMQ requires maxRetriesPerRequest: null when reusing a client across
// Queue/Worker instances (it calls .duplicate() internally).
export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

export const QUEUE_NAME = 'webhook-deliveries';

export const deliveryQueue = new Queue(QUEUE_NAME, { connection });
