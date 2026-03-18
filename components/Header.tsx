'use client';

import { useRouter } from 'next/navigation';
import { NotificationBell } from './NotificationBell';

const ROLE_LABEL: Record<string, string> = {
  ADMIN:               'Admin',
  PRODUCTION_MANAGER:  'Manager',
  PRODUCTION_EMPLOYEE: 'Employee',
  SALES:               'Sales',
  ACCOUNTS:            'Accounts',
  SHIPPING:            'Shipping',
  PURCHASE_MANAGER:    'Purchase Mgr',
  STORE_MANAGER:       'Store Mgr',
  PACKING:             'Packing',
};

export function Header({ title, user }: { title: string; user: { name: string; role: string } }) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header
      className="sticky top-0 z-40 px-4 py-3 flex items-center justify-between"
      style={{
        background: 'rgba(9, 9, 11, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Brand icon + title */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(14,165,233,0.2) 0%, rgba(14,165,233,0.06) 100%)',
            border: '1px solid rgba(14,165,233,0.2)',
          }}
        >
          <span className="text-sky-400 text-[9px] font-bold leading-none tracking-tight">S</span>
        </div>
        <h1 className="text-sm font-semibold text-white truncate">{title}</h1>
      </div>

      {/* User info + logout */}
      <div className="flex items-center gap-2">
        <NotificationBell />
        <span className="text-zinc-500 text-xs hidden sm:inline font-light">{user.name}</span>
        <span
          className="text-[10px] font-medium text-zinc-400 px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {ROLE_LABEL[user.role] ?? user.role.replace('_', ' ')}
        </span>
        <button
          type="button"
          onClick={logout}
          className="text-zinc-600 hover:text-zinc-300 text-xs tap-target px-2"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
