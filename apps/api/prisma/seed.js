import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
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
