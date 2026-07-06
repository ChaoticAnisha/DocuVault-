import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database…');

  const adminPassword = await bcrypt.hash('Admin@123456!', 12);
  const editorPassword = await bcrypt.hash('Editor@123456!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@docuvault.com' },
    update: {},
    create: {
      email: 'admin@docuvault.com',
      username: 'admin',
      passwordHash: adminPassword,
      role: Role.ADMIN,
      isEmailVerified: true,
    },
  });

  const editor = await prisma.user.upsert({
    where: { email: 'editor@docuvault.com' },
    update: {},
    create: {
      email: 'editor@docuvault.com',
      username: 'editor',
      passwordHash: editorPassword,
      role: Role.EDITOR,
      isEmailVerified: true,
    },
  });

  console.log('✓  Admin user:', admin.email, '(id:', admin.id + ')');
  console.log('✓  Editor user:', editor.email, '(id:', editor.id + ')');
  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
