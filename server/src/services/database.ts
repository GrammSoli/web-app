import { PrismaClient } from '@prisma/client';
import { dbLogger } from '../utils/logger.js';

// Singleton pattern для Prisma Client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Логирование запросов в dev режиме
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query' as never, (e: { query: string; duration: number }) => {
    dbLogger.debug({ query: e.query, duration: e.duration }, 'Prisma query');
  });
}

prisma.$on('error' as never, (e: { message: string }) => {
  dbLogger.error({ error: e.message }, 'Prisma error');
});

export default prisma;
