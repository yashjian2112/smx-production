import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProductsAdmin } from './ProductsAdmin';

export default async function AdminProductsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try {
    requireRole(session, 'ADMIN');
  } catch {
    redirect('/dashboard');
  }

  const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });

  return <ProductsAdmin products={products} />;
}
