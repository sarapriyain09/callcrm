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
      isActive: true
    },
    create: {
      username: 'admin',
      email: 'info@spelndidtechnology.co.uk',
      passwordHash: hashPassword('Splendid2024!'),
      role: 'ADMIN',
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { email: 'arun@splendidtechnology.co.uk' },
    update: {
      username: 'arun',
      passwordHash: hashPassword('Arun@2503'),
      role: 'AGENT',
      isActive: true
    },
    create: {
      username: 'arun',
      email: 'arun@splendidtechnology.co.uk',
      passwordHash: hashPassword('Arun@2503'),
      role: 'AGENT',
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
