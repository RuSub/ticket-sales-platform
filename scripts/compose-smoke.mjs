import { execFileSync } from 'node:child_process';
import net from 'node:net';

const ENABLED = process.env.COMPOSE_SMOKE === '1';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const COMPOSE_FILE = process.env.COMPOSE_FILE ?? 'docker-compose.yml';
const EMAIL = process.env.SMOKE_EMAIL ?? 'buyer@ticketplatform.com';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'ChangeMe123!';

if (!ENABLED) {
  console.log('SKIP compose smoke: set COMPOSE_SMOKE=1 (and start the app) to enable');
  process.exit(0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const canConnect = (host, port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    setTimeout(() => finish(false), 1000);
  });

const waitFor = async (predicate, label, timeout = 90_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await predicate()) {
      return;
    }
    await sleep(1000);
  }
  throw new Error(`${label} did not become ready in ${timeout}ms`);
};

async function main() {
  console.log('Starting compose services: postgres, redis, kafka...');
  execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', 'postgres', 'redis', 'kafka'], {
    stdio: 'inherit',
  });

  await waitFor(() => canConnect('127.0.0.1', 5432), 'postgres');
  await waitFor(() => canConnect('127.0.0.1', 6379), 'redis');
  await waitFor(() => canConnect('127.0.0.1', 9093), 'kafka');
  console.log('Dependencies are reachable');

  const health = await fetch(`${BASE}/api/health`);
  if (!health.ok) {
    throw new Error(`health endpoint returned ${health.status}`);
  }
  console.log('Health: ok');

  const loginResponse = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginResponse.ok) {
    throw new Error(`login failed: ${loginResponse.status}`);
  }
  const { accessToken } = await loginResponse.json();

  const eventsResponse = await fetch(`${BASE}/api/events`);
  const events = (await eventsResponse.json()).events ?? [];
  const event = events.find((item) => item.title.includes('Demo')) ?? events[0];
  if (!event) {
    throw new Error('no events available — run `npm run prisma:seed`');
  }

  const layout = await (
    await fetch(`${BASE}/api/events/${event.id}/available-seats/layout`)
  ).json();
  const seat = (layout.seats ?? []).find((item) => item.status === 'AVAILABLE');
  if (!seat) {
    throw new Error('no free seats for the smoke booking');
  }

  const cartResponse = await fetch(`${BASE}/api/cart`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ eventId: event.id, seatIds: [seat.id] }),
  });
  if (cartResponse.status !== 201) {
    throw new Error(`booking failed: ${cartResponse.status} ${await cartResponse.text()}`);
  }
  const reservation = await cartResponse.json();

  const release = await fetch(`${BASE}/api/cart/${reservation.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!release.ok) {
    throw new Error(`failed to release the reservation: ${release.status}`);
  }

  console.log('COMPOSE SMOKE OK');
}

main().catch((error) => {
  console.error('COMPOSE SMOKE FAILED:', error.message);
  process.exit(1);
});
