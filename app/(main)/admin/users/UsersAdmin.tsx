'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaceGate } from '@/components/FaceGate';

type User = { id: string; name: string; email: string; role: string; faceEnrolled: boolean; active: boolean };

type Modal =
  | { type: 'add' }
  | { type: 'edit'; user: User }
  | { type: 'enroll'; user: User }
  | null;

const ROLE_OPTIONS = [
  { value: 'PRODUCTION_EMPLOYEE', label: 'Production Employee' },
  { value: 'PRODUCTION_MANAGER',  label: 'Production Manager' },
  { value: 'SALES',               label: 'Sales' },
  { value: 'ACCOUNTS',            label: 'Accounts' },
  { value: 'SHIPPING',            label: 'Shipping' },
  { value: 'PURCHASE_MANAGER',    label: 'Purchase Manager' },
  { value: 'STORE_MANAGER',       label: 'Store Manager' },
  { value: 'PACKING',             label: 'Packing' },
  { value: 'ADMIN',               label: 'Admin' },
];

const ROLE_BADGE: Record<string, string> = {
  ADMIN:               'bg-violet-500/20 text-violet-400 border-violet-500/30',
  PRODUCTION_MANAGER:  'bg-sky-500/20 text-sky-400 border-sky-500/30',
  PRODUCTION_EMPLOYEE: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  SALES:               'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  ACCOUNTS:            'bg-amber-500/20 text-amber-400 border-amber-500/30',
  SHIPPING:            'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  PURCHASE_MANAGER:    'bg-orange-500/20 text-orange-400 border-orange-500/30',
  STORE_MANAGER:       'bg-teal-500/20 text-teal-400 border-teal-500/30',
  PACKING:             'bg-pink-500/20 text-pink-400 border-pink-500/30',
};
const ROLE_LABEL: Record<string, string> = {
  ADMIN:               'Admin',
  PRODUCTION_MANAGER:  'Manager',
  PRODUCTION_EMPLOYEE: 'Employee',
  SALES:               'Sales',
  ACCOUNTS:            'Accounts',
  SHIPPING:            'Shipping',
  PURCHASE_MANAGER:    'Purchase Manager',
  STORE_MANAGER:       'Store Manager',
  PACKING:             'Packing',
};

export function UsersAdmin({ users: initial }: { users: User[] }) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>(initial);
  const [modal, setModal] = useState<Modal>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Add form state
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'PRODUCTION_EMPLOYEE' });
  // Edit form state
  const [editForm, setEditForm] = useState({ name: '', role: 'PRODUCTION_EMPLOYEE', password: '' });

  function openAdd() {
    setAddForm({ name: '', email: '', password: '', role: 'PRODUCTION_EMPLOYEE' });
    setError('');
    setModal({ type: 'add' });
  }

  function openEdit(u: User) {
    setEditForm({ name: u.name, role: u.role, password: '' });
    setError('');
    setModal({ type: 'edit', user: u });
  }

  function closeModal() { setModal(null); setError(''); setSaving(false); }

  async function handleAdd() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create user'); setSaving(false); return; }
      setUsers((u) => [...u, { ...data, faceEnrolled: false }]);
      closeModal();
    } catch { setError('Network error'); setSaving(false); }
  }

  async function handleEdit() {
    if (modal?.type !== 'edit') return;
    setSaving(true);
    setError('');
    const body: Record<string, string> = { name: editForm.name, role: editForm.role };
    if (editForm.password) body.password = editForm.password;
    try {
      const res = await fetch(`/api/users/${modal.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to update user'); setSaving(false); return; }
      setUsers((us) => us.map((u) => u.id === data.id ? { ...u, ...data } : u));
      closeModal();
    } catch { setError('Network error'); setSaving(false); }
  }

  async function toggleActive(u: User) {
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !u.active }),
      });
      if (res.ok) {
        setUsers((us) => us.map((x) => x.id === u.id ? { ...x, active: !x.active } : x));
      }
    } catch { setError('Failed to update user status'); }
  }

  function handleEnrolled() {
    setModal(null);
    router.refresh();
  }

  // If enrolling, render FaceGate full screen
  if (modal?.type === 'enroll') {
    return (
      <FaceGate
        mode="enroll"
        userId={modal.user.id}
        title={`Enroll face — ${modal.user.name}`}
        onEnrolled={handleEnrolled}
        onCancel={closeModal}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Users</h2>
          <p className="text-xs text-slate-500 mt-0.5">{users.length} member{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      {/* User list */}
      <div className="space-y-2">
        {users.map((u) => (
          <div
            key={u.id}
            className={`rounded-xl border transition-opacity ${
              u.active
                ? 'bg-zinc-900 border-zinc-800'
                : 'bg-zinc-950 border-zinc-800/50 opacity-60'
            }`}
          >
            <div className="p-4">
              <div className="flex items-start gap-3">
                {/* Avatar initials */}
                <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-semibold text-slate-300 shrink-0">
                  {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm">{u.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${ROLE_BADGE[u.role] ?? 'bg-slate-600'}`}>
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                    {u.faceEnrolled ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-500/10 text-green-400 border-green-500/20">
                        Face ✓
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">
                        No face
                      </span>
                    )}
                    {!u.active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{u.email}</p>
                </div>
              </div>

              {/* Action row */}
              <div className="flex items-center gap-2 mt-3 pl-12">
                <button
                  onClick={() => openEdit(u)}
                  className="flex-1 py-1.5 rounded-lg border border-slate-600 hover:border-slate-400 text-xs text-slate-300 hover:text-white transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setModal({ type: 'enroll', user: u })}
                  className="flex-1 py-1.5 rounded-lg border border-slate-600 hover:border-sky-500 text-xs text-slate-300 hover:text-sky-400 transition-colors"
                >
                  {u.faceEnrolled ? 'Re-enroll' : 'Enroll Face'}
                </button>
                <button
                  onClick={() => toggleActive(u)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${
                    u.active
                      ? 'border-red-700/50 text-red-400 hover:border-red-500 hover:text-red-300'
                      : 'border-green-700/50 text-green-400 hover:border-green-500 hover:text-green-300'
                  }`}
                >
                  {u.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add User Modal */}
      {modal?.type === 'add' && (
        <Drawer title="Add New User" onClose={closeModal}>
          <label className="block text-xs text-slate-400 mb-1">Full Name</label>
          <input
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-3"
            placeholder="e.g. John Smith"
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
          />
          <label className="block text-xs text-slate-400 mb-1">Email</label>
          <input
            type="email"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-3"
            placeholder="name@smx.com"
            value={addForm.email}
            onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
          />
          <label className="block text-xs text-slate-400 mb-1">Password</label>
          <input
            type="password"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-3"
            placeholder="Min 6 characters"
            value={addForm.password}
            onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
          />
          <label className="block text-xs text-slate-400 mb-1">Role</label>
          <select
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 mb-4"
            value={addForm.role}
            onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
          >
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button onClick={closeModal} className="flex-1 py-2 rounded-lg border border-slate-600 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={saving || !addForm.name || !addForm.email || !addForm.password}
              className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-sm font-medium text-white transition-colors"
            >
              {saving ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </Drawer>
      )}

      {/* Edit User Modal */}
      {modal?.type === 'edit' && (
        <Drawer title={`Edit — ${modal.user.name}`} onClose={closeModal}>
          <label className="block text-xs text-slate-400 mb-1">Full Name</label>
          <input
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-3"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
          />
          <label className="block text-xs text-slate-400 mb-1">Role</label>
          <select
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 mb-3"
            value={editForm.role}
            onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
          >
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <label className="block text-xs text-slate-400 mb-1">New Password <span className="text-slate-600">(leave blank to keep)</span></label>
          <input
            type="password"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-4"
            placeholder="Enter new password…"
            value={editForm.password}
            onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
          />
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button onClick={closeModal} className="flex-1 py-2 rounded-lg border border-slate-600 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={handleEdit}
              disabled={saving || !editForm.name}
              className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-sm font-medium text-white transition-colors"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function Drawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
