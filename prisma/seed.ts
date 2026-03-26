import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = (p: string) => bcrypt.hash(p, 12);

  const productDefs = [
    { code: 'C350',  name: 'C350' },
    { code: 'L350',  name: 'CL350' },
    { code: 'C700',  name: 'C700' },
    { code: 'L700',  name: 'CL700' },
    { code: 'K100',  name: 'CC1000' },
    { code: 'C100',  name: 'C1000' },
    { code: 'L100',  name: 'CL1000' },
    { code: 'C140',  name: 'C1400' },
    { code: 'L140',  name: 'CL1400' },
    { code: 'M100',  name: 'SM100' },
    { code: 'M150',  name: 'SM150' },
    { code: 'M200',  name: 'SM200' },
    { code: 'M250',  name: 'SM250' },
    { code: 'M300',  name: 'SM300' },
    { code: 'M350',  name: 'SM350' },
    { code: 'MPOW',  name: 'SM250 POWERLAND' },
    { code: 'P400',  name: 'SMX BP72400' },
    { code: 'P550',  name: 'SMX BP72550' },
    { code: 'P727',  name: 'SMX BP72.7' },
    { code: 'P721',  name: 'SMX BP721000' },
    { code: 'P961',  name: 'SMX BP961000' },
  ];
  for (const p of productDefs) {
    await prisma.product.upsert({
      where: { code: p.code },
      create: { code: p.code, name: p.name },
      update: { name: p.name },
    });
  }
  const product = await prisma.product.findFirstOrThrow({ where: { code: 'C100' } });

  await prisma.user.upsert({
    where: { email: 'admin@smx.com' },
    create: {
      email: 'admin@smx.com',
      passwordHash: await hash('admin123'),
      name: 'Admin',
      role: 'ADMIN',
    },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: 'manager@smx.com' },
    create: {
      email: 'manager@smx.com',
      passwordHash: await hash('manager123'),
      name: 'Production Manager',
      role: 'PRODUCTION_MANAGER',
    },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: 'emp@smx.com' },
    create: {
      email: 'emp@smx.com',
      passwordHash: await hash('emp123'),
      name: 'Production Manager',
      role: 'PRODUCTION_MANAGER',
    },
    update: {},
  });

  const order = await prisma.order.upsert({
    where: { orderNumber: 'ORD-2024-001' },
    create: {
      orderNumber: 'ORD-2024-001',
      productId: product.id,
      quantity: 3,
      status: 'ACTIVE',
    },
    update: {},
  });

  const existingUnits = await prisma.controllerUnit.findMany({
    where: { orderId: order.id },
  });
  if (existingUnits.length === 0) {
    const serials = ['SMX100026001', 'SMX100026002', 'SMX100026003'];
    for (let i = 0; i < serials.length; i++) {
      await prisma.controllerUnit.create({
        data: {
          serialNumber: serials[i],
          orderId: order.id,
          productId: product.id,
          currentStage: i === 0 ? 'POWERSTAGE_MANUFACTURING' : i === 1 ? 'QC_AND_SOFTWARE' : 'FINAL_ASSEMBLY',
          currentStatus: i === 0 ? 'PENDING' : i === 1 ? 'WAITING_APPROVAL' : 'PENDING',
        },
      });
    }
  }

  await prisma.issueCategory.upsert({
    where: { code: 'WIRING' },
    create: { code: 'WIRING', name: 'Wiring defect' },
    update: {},
  });
  await prisma.rootCauseCategory.upsert({
    where: { code: 'ASSEMBLY' },
    create: { code: 'ASSEMBLY', name: 'Assembly error' },
    update: {},
  });

  console.log('Seed done.');
  console.log('Login: admin@smx.com / admin123');
  console.log('       manager@smx.com / manager123');
  console.log('       emp@smx.com / emp123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
