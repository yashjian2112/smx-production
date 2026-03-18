'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  relatedModel: string | null;
  relatedId: string | null;
  createdAt: string;
};

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getLink(n: Notification): string | null {
  if (!n.relatedModel || !n.relatedId) return null;
  const model = n.relatedModel.toLowerCase();
  if (model === 'invoice') return `/sales/${n.relatedId}`;
  if (model === 'order') return `/orders/${n.relatedId}`;
  if (model === 'unit') return `/units/${n.relatedId}`;
  if (model === 'dispatchorder') return `/shipping/do/${n.relatedId}`;
  if (model === 'return') return `/rework`;
  return null;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const d = await res.json();
        setNotifications(d.notifications);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleNotificationClick(n: Notification) {
    if (!n.isRead) await markRead(n.id);
    const link = getLink(n);
    setOpen(false);
    if (link) router.push(link);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
        style={{ background: open ? 'rgba(14,165,233,0.12)' : 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.1)' }}
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: '#ef4444', minWidth: '16px', height: '16px', padding: '0 3px' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-10 z-50 rounded-xl overflow-hidden shadow-2xl"
          style={{
            width: '320px',
            background: 'rgba(9,9,11,0.96)',
            border: '1px solid rgba(148,163,184,0.12)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="py-8 text-center text-zinc-500 text-sm">No notifications</div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className="w-full text-left px-4 py-3 transition-colors hover:bg-white/[0.03] flex gap-3 items-start"
                style={{ borderBottom: '1px solid rgba(148,163,184,0.05)' }}
              >
                {/* Unread dot */}
                <span
                  className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{ background: n.isRead ? 'transparent' : '#38bdf8' }}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold truncate ${n.isRead ? 'text-zinc-400' : 'text-white'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-zinc-600 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
