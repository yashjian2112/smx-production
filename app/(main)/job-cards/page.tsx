import { requireSession } from '@/lib/auth';
import JobCardsPanel from './JobCardsPanel';

export default async function JobCardsPage() {
  const session = await requireSession();
  return <JobCardsPanel sessionRole={session.role} />;
}
