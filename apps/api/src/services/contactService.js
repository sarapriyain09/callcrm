import { prisma } from './db.js';

export async function upsertContactByPhone(phone) {
  if (!phone) return null;

  return prisma.contact.upsert({
    where: { phone },
    update: {},
    create: { phone, tags: [] }
  });
}

export async function listContacts() {
  return prisma.contact.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 200
  });
}
