import { PrismaClient } from '@prisma/client';
import { createClient } from '@libsql/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient;
}

const prisma =
  globalThis.prisma ||
  new PrismaClient({
    adapter: new PrismaLibSQL(
      createClient({
        url: process.env.DATABASE_URL || 'file:./dev.db',
      })
    ),
  });

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;

export default prisma;
