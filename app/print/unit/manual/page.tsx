import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { ManualFinalLabel } from './ManualFinalLabel';

export default async function ManualFinalLabelPage({
  searchParams,
}: {
  searchParams: Promise<{ productCode?: string; productName?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  requireRole(session, 'ADMIN');

  const params = await searchParams;

  return (
    <ManualFinalLabel
      initialProductCode={params.productCode ?? ''}
      initialProductName={params.productName ?? ''}
    />
  );
}
