import { PrismaClient } from '@prisma/client';

const prismaSingleton = () => new PrismaClient();

export const prisma = prismaSingleton();
