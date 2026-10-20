import { PrismaClient } from '@prisma/client';
import autocannon from 'autocannon';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const CONNECTIONS = Number.parseInt(process.env.LOAD_CONNECTIONS ?? '1000', 10);
const DURATION = Number.parseInt(process.env.LOAD_DURATION ?? '10', 10);
const SEATS = Number.parseInt(process.env.LOAD_SEATS ?? '6000', 10);
const P95_LIMIT = Number.parseFloat(process.env.LOAD_P95_LIMIT ?? '500');
const ERROR_RATE_LIMIT = Number.parseFloat(process.env.LOAD_ERROR_RATE_LIMIT ?? '0.01');
const PASSWORD = 'LoadTest123!';

const prisma = new PrismaClient();
const suffix = randomUUID().slice(0, 8);

async function login(email) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  return body.accessToken;
}

async function cleanup(eventId, buyerId) {
  if (!eventId) {
    return;
  }

  // Give in-flight requests a moment to commit before deleting fixtures.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await prisma.auditLog
    .deleteMany({ where: { OR: [{ userId: buyerId }, { targetId: eventId }] } })
    .catch(() => undefined);
  await prisma.order.deleteMany({ where: { eventId } }).catch(() => undefined);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await prisma.reservation.deleteMany({ where: { eventId } }).catch(() => undefined);
    const remaining = await prisma.reservation.count({ where: { eventId } });
    if (remaining === 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await prisma.notificationDelivery
    .deleteMany({ where: { recipient: { contains: '@test.local' } } })
    .catch(() => undefined);
  await prisma.seat.deleteMany({ where: { eventId } }).catch(() => undefined);
  await prisma.seatCategory.deleteMany({ where: { eventId } }).catch(() => undefined);
  await prisma.event.deleteMany({ where: { id: eventId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: buyerId } }).catch(() => undefined);
}

async function main() {
  const organizer = await prisma.user.findFirst({ where: { role: 'ORGANIZER' } });
  if (!organizer) {
    throw new Error('No organizer found — run `npm run prisma:seed` first');
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const buyer = await prisma.user.create({
    data: { email: `load-${suffix}@test.local`, passwordHash, role: 'BUYER' },
  });

  let eventId;
  try {
    const token = await login(buyer.email);

    const event = await prisma.event.create({
      data: {
        organizerId: organizer.id,
        title: `Load ${suffix}`,
        eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        genre: 'CONCERT',
        status: 'APPROVED',
        saleStartTime: new Date(Date.now() - 60_000),
      },
    });
    eventId = event.id;

    const category = await prisma.seatCategory.create({
      data: { eventId, name: 'Load', price: 1000, capacity: SEATS },
    });

    const seats = Array.from({ length: SEATS }, (_, index) => ({
      eventId,
      rowNumber: Math.floor(index / 50) + 1,
      seatNumber: (index % 50) + 1,
      categoryId: category.id,
    }));
    for (let offset = 0; offset < seats.length; offset += 1000) {
      await prisma.seat.createMany({ data: seats.slice(offset, offset + 1000) });
    }

    const layoutResponse = await fetch(`${BASE}/api/events/${eventId}/available-seats/layout`);
    const layout = await layoutResponse.json();
    const seatIds = layout.seats.map((seat) => seat.id);

    console.log(
      `Prepared event=${eventId} seats=${seatIds.length} connections=${CONNECTIONS} duration=${DURATION}s`,
    );

    let cursor = 0;
    const result = await new Promise((resolve, reject) => {
      const instance = autocannon(
        {
          url: `${BASE}/api/cart`,
          connections: CONNECTIONS,
          duration: DURATION,
          requests: [
            {
              method: 'POST',
              path: '/api/cart',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${token}`,
              },
              setupRequest: (request) => {
                const seatId = seatIds[cursor];
                cursor += 1;
                const body = JSON.stringify({
                  eventId,
                  seatIds: seatId ? [seatId] : [],
                });
                return { ...request, body };
              },
            },
          ],
        },
        (error, response) => (error ? reject(error) : resolve(response)),
      );
      autocannon.track(instance, { renderProgressBar: false });
    });

    const total = result.requests.total;
    const errors = result.non2xx + result.errors;
    const errorRate = total > 0 ? errors / total : 1;

    const summary = {
      connections: CONNECTIONS,
      durationSeconds: DURATION,
      seatsPrepared: seatIds.length,
      requests: total,
      rps: Math.round(result.requests.average),
      latencyMs: {
        p50: result.latency.p50,
        p95: result.latency.p97_5, // autocannon reports p97.5; used as a conservative p95 bound
        p99: result.latency.p99,
        max: result.latency.max,
      },
      non2xx: result.non2xx,
      statusCodes: result.statusCodeStats,
      transportErrors: result.errors,
      errorRate: Number(errorRate.toFixed(4)),
    };
    console.log(JSON.stringify(summary, null, 2));

    if (result.latency.p97_5 > P95_LIMIT || errorRate > ERROR_RATE_LIMIT) {
      console.error(
        `FAILED: p97.5=${result.latency.p97_5}ms (limit ${P95_LIMIT}ms), errorRate=${(errorRate * 100).toFixed(2)}% (limit ${(ERROR_RATE_LIMIT * 100).toFixed(2)}%)`,
      );
      process.exitCode = 1;
    }
  } finally {
    await cleanup(eventId, buyer.id);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error('Load test failed:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
