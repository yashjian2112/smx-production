import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getAllSettings } from '@/lib/app-settings';
import { SettingsForm } from './SettingsForm';

export default async function AccountsSettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const canAccess = ['ADMIN', 'ACCOUNTS'].includes(session.role);
  if (!canAccess) redirect('/dashboard');

  const settings = await getAllSettings();

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h2 className="text-xl font-semibold">Invoice Settings</h2>
      <SettingsForm settings={settings} />
    </div>
  );
}
