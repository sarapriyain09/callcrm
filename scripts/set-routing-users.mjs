import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../apps/api/src/utils/passwordHash.js';

const prisma = new PrismaClient();

try {
  await prisma.user.updateMany({
    where: { username: { equals: 'admin', mode: 'insensitive' } },
    data: {
      team: 'ACCOUNTS',
      phoneNumber: '+447721952967',
      isActive: true
    }
  });

  await prisma.user.updateMany({
    where: { username: { equals: 'arun', mode: 'insensitive' } },
    data: {
      team: 'SALES',
      phoneNumber: '+447810823317',
      isActive: true
    }
  });

  const existingShiva = await prisma.user.findFirst({
    where: { email: { equals: 'shiva@splendidtechnology.co.uk', mode: 'insensitive' } }
  });

  if (existingShiva) {
    await prisma.user.update({
      where: { id: existingShiva.id },
      data: {
        username: 'shiva',
        role: 'AGENT',
        team: 'SUPPORT',
        phoneNumber: '+447352667785',
        passwordHash: hashPassword('Shiva@2809'),
        isActive: true
      }
    });
  } else {
    await prisma.user.create({
      data: {
        username: 'shiva',
        email: 'shiva@splendidtechnology.co.uk',
        passwordHash: hashPassword('Shiva@2809'),
        role: 'AGENT',
        team: 'SUPPORT',
        phoneNumber: '+447352667785',
        isActive: true
      }
    });
  }

  const users = await prisma.user.findMany({
    orderBy: { username: 'asc' },
    select: {
      username: true,
      email: true,
      role: true,
      team: true,
      phoneNumber: true,
      isActive: true
    }
  });

  console.log(JSON.stringify({ ok: true, users }, null, 2));
} finally {
  await prisma.$disconnect();
}
