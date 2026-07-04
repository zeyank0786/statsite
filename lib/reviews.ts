import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getOrCreateDefaultCycle() {
  let cycle = await prisma.reviewCycle.findFirst({
    where: { label: 'Collaborative Reviews' },
  });

  if (!cycle) {
    cycle = await prisma.reviewCycle.create({
      data: {
        label: 'Collaborative Reviews',
        status: 'in_progress',
      },
    });
  }

  return cycle.id;
}
