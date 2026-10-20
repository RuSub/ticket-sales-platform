import { EventGenre, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type Zone = { name: string; rows: [number, number]; multiplier: number };
type Layout = { name: string; rows: number; seatsPerRow: number; basePrice: number; zones: Zone[] };

const theaterLayout: Layout = {
  name: 'Theater Hall',
  rows: 10,
  seatsPerRow: 20,
  basePrice: 2000,
  zones: [
    { name: 'VIP', rows: [1, 2], multiplier: 2.0 },
    { name: 'Premium', rows: [3, 5], multiplier: 1.5 },
    { name: 'Standard', rows: [6, 8], multiplier: 1.0 },
    { name: 'Balcony', rows: [9, 10], multiplier: 0.7 },
  ],
};

const stadiumLayout: Layout = {
  name: 'Stadium',
  rows: 30,
  seatsPerRow: 50,
  basePrice: 1500,
  zones: [
    { name: 'Box', rows: [1, 3], multiplier: 3.0 },
    { name: 'Lower', rows: [4, 15], multiplier: 1.5 },
    { name: 'Upper', rows: [16, 25], multiplier: 1.0 },
    { name: 'Standing', rows: [26, 30], multiplier: 0.5 },
  ],
};

const concertLayout: Layout = {
  name: 'Concert Hall',
  rows: 15,
  seatsPerRow: 30,
  basePrice: 2500,
  zones: [
    { name: 'Front Row', rows: [1, 1], multiplier: 2.5 },
    { name: 'VIP', rows: [2, 4], multiplier: 2.0 },
    { name: 'Main', rows: [5, 10], multiplier: 1.0 },
    { name: 'Back', rows: [11, 15], multiplier: 0.6 },
  ],
};

const DEMO_EVENT_ID = '11111111-1111-4111-8111-111111111111';

async function main() {
  console.log('Seeding database...');

  const seedPassword = process.env.SEED_PASSWORD || 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  const accounts: Array<{ email: string; role: UserRole; fullName: string }> = [
    { email: 'admin@ticketplatform.com', role: UserRole.ADMIN, fullName: 'Platform Admin' },
    { email: 'organizer@ticketplatform.com', role: UserRole.ORGANIZER, fullName: 'Test Organizer' },
    { email: 'agency@ticketplatform.com', role: UserRole.AGENCY, fullName: 'Test Agency' },
    { email: 'support@ticketplatform.com', role: UserRole.SUPPORT, fullName: 'Test Support' },
    { email: 'buyer@ticketplatform.com', role: UserRole.BUYER, fullName: 'Test Buyer' },
  ];

  const users = new Map<UserRole, { id: string; email: string }>();
  for (const account of accounts) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { passwordHash, role: account.role, isActive: true },
      create: {
        email: account.email,
        passwordHash,
        role: account.role,
        fullName: account.fullName,
      },
    });
    users.set(account.role, { id: user.id, email: user.email });
    console.log(`Seeded: ${user.email} (${account.role})`);
  }

  const organizerId = users.get(UserRole.ORGANIZER)?.id;
  if (!organizerId) {
    throw new Error('Organizer account was not created');
  }

  // `update` is intentional: older databases contain templates without
  // basePrice and with a single-row `rows` array, which broke seat generation.
  const templates: Array<{ id: string; name: string; layout: Layout }> = [
    { id: 'template-theater', name: 'Theater', layout: theaterLayout },
    { id: 'template-stadium', name: 'Stadium', layout: stadiumLayout },
    { id: 'template-concert', name: 'Concert Hall', layout: concertLayout },
  ];

  for (const template of templates) {
    await prisma.venueTemplate.upsert({
      where: { id: template.id },
      update: { name: template.name, layoutSchema: template.layout },
      create: { id: template.id, name: template.name, layoutSchema: template.layout },
    });
  }
  console.log(`Seeded venue templates: ${templates.map((template) => template.name).join(', ')}`);

  const demoEvent = await prisma.event.upsert({
    where: { id: DEMO_EVENT_ID },
    update: {
      organizerId,
      status: 'APPROVED',
      templateId: 'template-concert',
      venueLayout: concertLayout,
    },
    create: {
      id: DEMO_EVENT_ID,
      organizerId,
      title: 'Demo Concert',
      description: 'Seeded demo event used for smoke tests',
      eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      venueName: 'Demo Hall',
      venueAddress: 'Demo street 1',
      genre: EventGenre.CONCERT,
      status: 'APPROVED',
      saleStartTime: new Date(Date.now() - 60 * 1000),
      templateId: 'template-concert',
      venueLayout: concertLayout,
    },
  });

  // Re-generate demo seats so re-seeding a dirty database always converges.
  await prisma.seat.deleteMany({ where: { eventId: demoEvent.id } });
  await prisma.seatCategory.deleteMany({ where: { eventId: demoEvent.id } });

  const categoryIds = new Map<string, string>();
  for (const zone of concertLayout.zones) {
    const rowsInZone = zone.rows[1] - zone.rows[0] + 1;
    const category = await prisma.seatCategory.create({
      data: {
        eventId: demoEvent.id,
        name: zone.name,
        zoneName: zone.name,
        price: Number((concertLayout.basePrice * zone.multiplier).toFixed(2)),
        capacity: rowsInZone * concertLayout.seatsPerRow,
      },
    });
    categoryIds.set(zone.name, category.id);
  }

  const seats: Array<{
    eventId: string;
    rowNumber: number;
    seatNumber: number;
    categoryId: string;
  }> = [];

  for (let row = 1; row <= concertLayout.rows; row += 1) {
    const zone = concertLayout.zones.find(
      (candidate) => row >= candidate.rows[0] && row <= candidate.rows[1],
    );
    const categoryId = zone ? categoryIds.get(zone.name) : undefined;
    if (!categoryId) {
      continue;
    }
    for (let seatNumber = 1; seatNumber <= concertLayout.seatsPerRow; seatNumber += 1) {
      seats.push({ eventId: demoEvent.id, rowNumber: row, seatNumber, categoryId });
    }
  }

  await prisma.seat.createMany({ data: seats });
  console.log(`Generated ${seats.length} seats for demo event ${demoEvent.id}`);

  await prisma.platformSetting.upsert({
    where: { key: 'platform_commission' },
    update: {},
    create: {
      key: 'platform_commission',
      value: { percentage: 10, currency: 'RUB' },
    },
  });

  console.log(`Seed password for all accounts: ${seedPassword}`);
  console.log('Seeding complete.');
}

main()
  .catch((error) => {
    console.error('Seeding error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
