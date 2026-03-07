'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string; icon: string };

const managerNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/orders', label: 'Orders', icon: '📋' },
  { href: '/serial', label: 'Serial', icon: '🔍' },
  { href: '/approvals', label: 'Approve', icon: '✓' },
  { href: '/reports', label: 'Reports', icon: '📈' },
];

const employeeNav: NavItem[] = [
  { href: '/dashboard', label: 'My Work', icon: '📊' },
  { href: '/my-tasks', label: 'Tasks', icon: '📋' },
  { href: '/serial', label: 'Serial', icon: '🔍' },
  { href: '/my-performance', label: 'Performance', icon: '📈' },
];

export function BottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const items = role === 'PRODUCTION_EMPLOYEE' ? employeeNav : managerNav;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-smx-surface border-t border-slate-600 pb-safe md:relative md:border-t-0 md:pb-0">
      <div className="flex justify-around items-center h-16 md:gap-2">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-2 tap-target rounded-lg md:flex-initial md:px-4 ${
                active ? 'text-sky-400 bg-sky-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
