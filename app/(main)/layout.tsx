import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { BottomNav } from '@/components/BottomNav';
import { Header } from '@/components/Header';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-dvh flex flex-col pb-20 md:pb-0">
      <Header title="SMX Drives" user={{ name: session.name, role: session.role }} />
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">{children}</main>
      <BottomNav role={session.role} />
    </div>
  );
}
