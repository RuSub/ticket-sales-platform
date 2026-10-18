import { PrismaClient, EventGenre, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@ticketplatform.com' },
    update: {},
    create: {
      email: 'admin@ticketplatform.com',
      passwordHash: '$2b$12$LZm8XfJ3p3VqHqVQvqJ1pOuK5tY3xZ1qW2rT4sU6vN8wP0mE5gI2a',
      role: UserRole.ADMIN,
      fullName: 'Platform Admin',
    },
  });

  // Create organizer user
  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@ticketplatform.com' },
    update: {},
    create: {
      email: 'organizer@ticketplatform.com',
      passwordHash: '$2b$12$LZm8XfJ3p3VqHqVQvqJ1pOuK5tY3xZ1qW2rT4sU6vN8wP0mE5gI2a',
      role: UserRole.ORGANIZER,
      fullName: 'Test Organizer',
    },
  });

  // Create agency user
  const agency = await prisma.user.upsert({
    where: { email: 'agency@ticketplatform.com' },
    update: {},
    create: {
      email: 'agency@ticketplatform.com',
      passwordHash: '$2b$12$LZm8XfJ3p3VqHqVQvqJ1pOuK5tY3xZ1qW2rT4sU6vN8wP0mE5gI2a',
      role: UserRole.AGENCY,
      fullName: 'Test Agency',
    },
  });

  // Create venue templates
  const theaterTemplate = await prisma.venueTemplate.upsert({
    where: { id: 'template-theater' },
    update: {},
    create: {
      id: 'template-theater',
      name: 'Theater',
      layoutSchema: {
        name: 'Theater Hall',
        rows: 10,
        seatsPerRow: 20,
        zones: [
          { name: 'VIP', rows: [1, 2], multiplier: 2.0 },
          { name: 'Premium', rows: [3, 5], multiplier: 1.5 },
          { name: 'Standard', rows: [6, 8], multiplier: 1.0 },
          { name: 'Balcony', rows: [9, 10], multiplier: 0.7 },
        ],
      },
    },
  });

  const stadiumTemplate = await prisma.venueTemplate.upsert({
    where: { id: 'template-stadium' },
    update: {},
    create: {
      id: 'template-stadium',
      name: 'Stadium',
      layoutSchema: {
        name: 'Stadium',
        rows: 30,
        seatsPerRow: 50,
        zones: [
          { name: 'Box', rows: [1, 3], multiplier: 3.0 },
          { name: 'Lower', rows: [4, 15], multiplier: 1.5 },
          { name: 'Upper', rows: [16, 25], multiplier: 1.0 },
          { name: 'Standing', rows: [26, 30], multiplier: 0.5 },
        ],
      },
    },
  });

  const concertTemplate = await prisma.venueTemplate.upsert({
    where: { id: 'template-concert' },
    update: {},
    create: {
      id: 'template-concert',
      name: 'Concert Hall',
      layoutSchema: {
        name: 'Concert Hall',
        rows: 15,
        seatsPerRow: 30,
        zones: [
          { name: 'Front Row', rows: [1], multiplier: 2.5 },
          { name: 'VIP', rows: [2, 4], multiplier: 2.0 },
          { name: 'Main', rows: [5, 10], multiplier: 1.0 },
          { name: 'Back', rows: [11, 15], multiplier: 0.6 },
        ],
        hasStandingArea: true,
      },
    },
  });

  // Create platform settings
  await prisma.platformSetting.upsert({
    where: { key: 'platform_commission' },
    update: {},
    create: {
      key: 'platform_commission',
      value: { percentage: 10, currency: 'RUB' },
    },
  });

  console.log(`Seeded: ${admin.email} (ADMIN)`);
  console.log(`Seeded: ${organizer.email} (ORGANIZER)`);
  console.log(`Seeded: ${agency.email} (AGENCY)`);
  console.log(`Seeded venue templates: ${theaterTemplate.name}, ${stadiumTemplate.name}, ${concertTemplate.name}`);
  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
