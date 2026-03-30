'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/* ── SVG Icon set — stroke-based, 1.5 weight, minimal ── */
const Icons = {
  Invoice: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Clients: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Accounts: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
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
  Returns: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h11a4 4 0 0 1 0 8h-1" />
    </svg>
  ),
  Shipping: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
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
  Dispatch: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Purchase: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
  Inventory: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <line x1="12" y1="2.08" x2="12" y2="12" />
    </svg>
  ),
  AR: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  Pack: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
      <line x1="9" y1="9" x2="15" y2="6" />
    </svg>
  ),
  Status: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  JobCards: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
};

type NavItem = { href: string; label: string; icon: keyof typeof Icons };

const managerNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'Dashboard' },
  { href: '/orders',    label: 'Orders',    icon: 'Orders' },
  { href: '/shipping',  label: 'Shipping',  icon: 'Shipping' },
  { href: '/rework',    label: 'Returns',   icon: 'Returns' },
  { href: '/reports',   label: 'Reports',   icon: 'Reports' },
];

const adminNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'Dashboard' },
  { href: '/orders',    label: 'Orders',    icon: 'Orders'    },
  { href: '/purchase',  label: 'Purchase',  icon: 'Purchase'  },
  { href: '/inventory', label: 'Inventory', icon: 'Inventory' },
  { href: '/admin',     label: 'Admin',     icon: 'Admin'     },
];

const employeeNav: NavItem[] = [
  { href: '/my-tasks',    label: 'My Tasks', icon: 'Dashboard' },
  { href: '/orders',      label: 'Orders',   icon: 'Orders'    },
  { href: '/my-dispatch', label: 'Dispatch', icon: 'Dispatch'  },
  { href: '/rework',      label: 'Rework',   icon: 'Returns'   },
];

const packingNav: NavItem[] = [
  { href: '/shipping',    label: 'Packing',   icon: 'Pack'      },
  { href: '/my-dispatch', label: 'Dispatch',  icon: 'Dispatch'  },
  { href: '/dashboard',   label: 'Dashboard', icon: 'Dashboard' },
];

// SALES: 3 items — Invoices, Order Status, Clients
const salesNav: NavItem[] = [
  { href: '/sales',            label: 'Invoices', icon: 'Invoice' },
  { href: '/sales?tab=status', label: 'Status',   icon: 'Status'  },
  { href: '/sales/clients',    label: 'Clients',  icon: 'Clients' },
];

// ACCOUNTS: 5 items — Shipping (approval), Approvals, AR, Invoices (→ /sales), Settings
const accountsNav: NavItem[] = [
  { href: '/shipping',             label: 'Shipping',  icon: 'Shipping' },
  { href: '/accounts',             label: 'Approvals', icon: 'Accounts' },
  { href: '/accounts/receivable',  label: 'AR',        icon: 'AR'       },
  { href: '/sales',                label: 'Invoices',  icon: 'Invoice'  },
  { href: '/accounts/settings',    label: 'Settings',  icon: 'Admin'    },
];

const shippingNav: NavItem[] = [
  { href: '/my-dispatch', label: 'Dispatch',  icon: 'Dispatch'  },
  { href: '/shipping',    label: 'Packing',   icon: 'Pack'      },
  { href: '/dashboard',   label: 'Dashboard', icon: 'Dashboard' },
];

// PURCHASE_MANAGER: procurement flow
const purchaseNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard',   icon: 'Dashboard'  },
  { href: '/purchase',  label: 'Procurement', icon: 'Purchase'   },
];

// INVENTORY_MANAGER / STORE_MANAGER
const inventoryNav: NavItem[] = [
  { href: '/inventory',  label: 'Inventory',  icon: 'Inventory'  },
  { href: '/grn',        label: 'GRN',        icon: 'Pack'       },
  { href: '/job-cards',  label: 'Job Cards',  icon: 'JobCards'   },
  { href: '/purchase',   label: 'Req. Order', icon: 'Purchase'   },
];

export function BottomNav({ role }: { role: string }) {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const currentTab   = searchParams.get('tab') ?? '';
  const [badges, setBadges] = useState<Record<string, number>>({});

  // Fetch notification counts
  useEffect(() => {
    let mounted = true;
    async function fetchBadges() {
      try {
        const r = await fetch('/api/notifications/counts');
        if (r.ok && mounted) {
          const data = await r.json();
          setBadges(data);
        }
      } catch {}
    }
    fetchBadges();
    const interval = setInterval(fetchBadges, 30000); // refresh every 30s
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const items =
    role === 'PRODUCTION_EMPLOYEE' ? employeeNav  :
    role === 'PACKING'             ? packingNav   :
    role === 'ADMIN'               ? adminNav     :
    role === 'SALES'               ? salesNav     :
    role === 'ACCOUNTS'            ? accountsNav  :
    role === 'SHIPPING'            ? shippingNav  :
    role === 'PURCHASE_MANAGER'    ? purchaseNav   :
    role === 'INVENTORY_MANAGER'   ? inventoryNav  :
    role === 'STORE_MANAGER'       ? inventoryNav  :
    managerNav;

  // Map nav href to badge key
  function getBadge(href: string): number {
    return badges[href] ?? 0;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 pb-safe md:relative md:pb-0"
      style={{
        background: 'linear-gradient(0deg, rgba(22,22,28,0.68) 0%, rgba(38,38,44,0.72) 100%)',
        backdropFilter: 'blur(40px) saturate(200%) brightness(1.1)',
        WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(1.1)',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 -1px 0 rgba(255,255,255,0.06) inset, 0 -2px 20px rgba(0,0,0,0.35)',
      }}
    >
      <div className="flex justify-around items-center h-16 md:gap-2">
        {items.map((item) => {
          // Parse any ?tab= in the nav item href
          const [itemPath, itemQuery] = item.href.split('?');
          const itemTab = itemQuery ? new URLSearchParams(itemQuery).get('tab') ?? '' : '';

          // Active: path matches AND (no tab param on item, OR tab param matches current)
          const pathMatch = pathname === itemPath ||
            (itemPath !== '/dashboard' && itemPath !== '/sales' && pathname.startsWith(itemPath));
          const salesPathMatch = itemPath === '/sales' && pathname === '/sales';
          const tabMatch = itemTab === '' ? (currentTab === '' || !itemQuery) : currentTab === itemTab;

          const active = itemPath === '/sales'
            ? salesPathMatch && tabMatch
            : pathMatch;

          const IconComponent = Icons[item.icon];

          const badgeCount = getBadge(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center flex-1 py-2 gap-1 tap-target rounded-xl md:flex-initial md:px-4 ${
                active ? 'text-sky-400' : 'text-zinc-600 hover:text-zinc-400'
              }`}
              style={active ? { background: 'rgba(14, 165, 233, 0.08)' } : undefined}
            >
              <div className="relative">
                <IconComponent />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full px-1 leading-none">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </div>
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
