import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { BottomNav } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { FaceSessionGate } from '@/components/FaceSessionGate';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  // Check if this user already passed face verification (cookie set for 8 hrs)
  const cookieStore = await cookies();
  const faceOk = cookieStore.get('smx_face_ok')?.value === session.id;

  return (
    <FaceSessionGate userId={session.id} serverVerified={faceOk}>
      <div className="min-h-dvh flex flex-col pb-20 md:pb-0">
        <Header title="SMX Drives" user={{ name: session.name, role: session.role }} />
        <main className="flex-1 p-4 max-w-4xl mx-auto w-full">{children}</main>
        <BottomNav role={session.role} />
      </div>
    </FaceSessionGate>
  );
}
