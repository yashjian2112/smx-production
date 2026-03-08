import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { UsersAdmin } from './UsersAdmin';

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try {
    requireRole(session, 'ADMIN');
  } catch {
    redirect('/dashboard');
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, faceEnrolled: true, active: true },
    orderBy: { name: 'asc' },
  });

  return <UsersAdmin users={users} />;
}
