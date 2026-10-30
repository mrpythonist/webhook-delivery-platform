import { prisma } from '../db';
import { deliveryQueue } from '../queue';

/**
 * Creates a WebhookEvent and fans out one Delivery per active, subscribed
 * endpoint (empty `events` array = subscribed to all event types), then
 * enqueues each delivery on BullMQ with the endpoint's retry policy:
 *   attempts = maxAttempts, exponential backoff with base backoffBaseMs.
 */
export async function publishEvent(type: string, payload: unknown) {
  const event = await prisma.webhookEvent.create({
    data: { type, payload: payload as object },
  });

  const endpoints = await prisma.endpoint.findMany({ where: { active: true } });
  const subscribed = endpoints.filter(
    (e) => e.events.length === 0 || e.events.includes(type),
  );

  const deliveries = [];
  for (const endpoint of subscribed) {
    const delivery = await prisma.delivery.create({
      data: {
        eventId: event.id,
        endpointId: endpoint.id,
        status: 'queued',
      },
    });

    await deliveryQueue.add(
      'deliver',
      { deliveryId: delivery.id },
      {
        jobId: delivery.id, // idempotent: same delivery is never queued twice
        attempts: endpoint.maxAttempts,
        backoff: { type: 'exponential', delay: endpoint.backoffBaseMs },
        removeOnComplete: 200,
        removeOnFail: 200,
      },
    );

    deliveries.push(delivery);
  }

  return { event, deliveries };
}
