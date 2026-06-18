import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/passwordHash.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: 'info@spelndidtechnology.co.uk' },
    update: {
      username: 'admin',
      passwordHash: hashPassword('Splendid2024!'),
      role: 'ADMIN',
      team: 'SUPPORT',
      phoneNumber: '+447810823317',
      isActive: true
    },
    create: {
      username: 'admin',
      email: 'info@spelndidtechnology.co.uk',
      passwordHash: hashPassword('Splendid2024!'),
      role: 'ADMIN',
      team: 'SUPPORT',
      phoneNumber: '+447810823317',
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { email: 'arun@splendidtechnology.co.uk' },
    update: {
      username: 'arun',
      passwordHash: hashPassword('Arun@2503'),
      role: 'AGENT',
      team: 'SALES',
      phoneNumber: '+447352667785',
      isActive: true
    },
    create: {
      username: 'arun',
      email: 'arun@splendidtechnology.co.uk',
      passwordHash: hashPassword('Arun@2503'),
      role: 'AGENT',
      team: 'SALES',
      phoneNumber: '+447352667785',
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { email: 'demo@splendidtechnology.co.uk' },
    update: {
      username: 'demo',
      passwordHash: hashPassword('Demo@1234'),
      role: 'AGENT',
      team: 'SUPPORT',
      phoneNumber: '+447700900123',
      isActive: true
    },
    create: {
      username: 'demo',
      email: 'demo@splendidtechnology.co.uk',
      passwordHash: hashPassword('Demo@1234'),
      role: 'AGENT',
      team: 'SUPPORT',
      phoneNumber: '+447700900123',
      isActive: true
    }
  });

  await prisma.contact.upsert({
    where: { phone: '+441111111111' },
    update: {},
    create: {
      name: 'Acme Manufacturing',
      phone: '+441111111111',
      email: 'ops@acme.example',
      tags: ['manufacturing', 'priority'],
      notes: 'Existing ERP transformation client.'
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
