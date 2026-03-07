import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Employees() {
  const { api } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', badge_id: '' });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api('/employees')
      .then((r) => r.ok ? r.json() : [])
      .then(setList)
      .finally(() => setLoading(false));
  };

  useEffect(load, [api]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (editingId) {
      const res = await api(`/employees/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Update failed');
        return;
      }
      setEditingId(null);
    } else {
      const res = await api('/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Create failed');
        return;
      }
    }
    setForm({ name: '', badge_id: '' });
    setShowForm(false);
    load();
  };

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Employees</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Manage employees. Link users to employees for unit and controller logging.
      </p>
      {error && <div className="error-msg">{error}</div>}
      <div style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', badge_id: '' }); }}>
          Add employee
        </button>
      </div>
      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Badge ID (optional)</label>
              <input value={form.badge_id} onChange={(e) => setForm((f) => ({ ...f, badge_id: e.target.value }))} placeholder="E001" />
            </div>
            <button type="submit" className="btn btn-primary">{editingId ? 'Update' : 'Create'}</button>
            <button type="button" className="btn btn-ghost" style={{ marginLeft: '0.5rem' }} onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
          </form>
        </div>
      )}
      <div className="card">
        {loading ? (
          <p className="empty-state">Loading…</p>
        ) : list.length === 0 ? (
          <p className="empty-state">No employees. Add one above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Badge ID</th>
                  <th>Records</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td>{e.badge_id || '—'}</td>
                    <td>{e.records_count}</td>
                    <td>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                        onClick={() => { setForm({ name: e.name, badge_id: e.badge_id || '' }); setEditingId(e.id); setShowForm(true); }}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
