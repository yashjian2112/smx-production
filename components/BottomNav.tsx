'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* ── SVG Icon set — stroke-based, 1.5 weight, minimal ── */
const Icons = {
  Dashboard: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  Orders: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  ),
  Serial: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  Approve: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Reports: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Admin: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
  Tasks: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  Performance: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
};

type NavItem = { href: string; label: string; icon: keyof typeof Icons };

const managerNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'Dashboard' },
  { href: '/orders', label: 'Orders', icon: 'Orders' },
  { href: '/serial', label: 'Serial', icon: 'Serial' },
  { href: '/reports', label: 'Reports', icon: 'Reports' },
];

const adminNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'Dashboard' },
  { href: '/orders', label: 'Orders', icon: 'Orders' },
  { href: '/reports', label: 'Reports', icon: 'Reports' },
  { href: '/admin', label: 'Admin', icon: 'Admin' },
];

const employeeNav: NavItem[] = [
  { href: '/dashboard', label: 'My Work', icon: 'Dashboard' },
  { href: '/my-tasks', label: 'Tasks', icon: 'Tasks' },
  { href: '/serial', label: 'Serial', icon: 'Serial' },
  { href: '/my-performance', label: 'Performance', icon: 'Performance' },
];

export function BottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const items =
    role === 'PRODUCTION_EMPLOYEE' ? employeeNav :
    role === 'ADMIN' ? adminNav :
    managerNav;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 pb-safe md:relative md:pb-0"
      style={{
        background: 'rgba(9, 9, 11, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      <div className="flex justify-around items-center h-16 md:gap-2">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const IconComponent = Icons[item.icon];

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center flex-1 py-2 gap-1 tap-target rounded-xl md:flex-initial md:px-4 ${
                active ? 'text-sky-400' : 'text-zinc-600 hover:text-zinc-400'
              }`}
              style={active ? { background: 'rgba(14, 165, 233, 0.08)' } : undefined}
            >
              <IconComponent />
              <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
              {active && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                  style={{ background: 'rgba(14, 165, 233, 0.7)' }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
