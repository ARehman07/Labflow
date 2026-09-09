import { PrismaClient } from '@prisma/client';
import { ensureDatabaseUrl } from './database-url';

// Managed Postgres add-ons often expose the connection string under their own
// name (POSTGRES_URL, STORAGE_URL, …). Fill DATABASE_URL in before the client
// is constructed, or Prisma reports it as empty on a perfectly good database.
ensureDatabaseUrl();

// Single Prisma instance across hot-reloads in dev (avoids connection exhaustion).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
