import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function DailyUnits() {
  const { api, user, isAdmin, isSupervisor } = useAuth();
  const [list, setList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employee_id: '', date: '', units_count: '', notes: '' });
  const [filters, setFilters] = useState({ from: '', to: '', employee_id: '' });
  const [error, setError] = useState('');

  const canChooseEmployee = isAdmin || isSupervisor;
  const myId = user?.employee_id;

  useEffect(() => {
    api('/employees').then((r) => r.ok ? r.json() : []).then(setEmployees);
  }, [api]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.employee_id) params.set('employee_id', filters.employee_id);
    api(`/units?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setList)
      .finally(() => setLoading(false));
  };

  useEffect(load, [api, filters.from, filters.to, filters.employee_id]);

  useEffect(() => {
    if (!form.date) setForm((f) => ({ ...f, date: new Date().toISOString().slice(0, 10) }));
    if (canChooseEmployee && employees.length && !form.employee_id && myId) setForm((f) => ({ ...f, employee_id: String(myId) }));
    else if (canChooseEmployee && employees.length && !form.employee_id) setForm((f) => ({ ...f, employee_id: String(employees[0]?.id || '') }));
    if (!canChooseEmployee && myId) setForm((f) => ({ ...f, employee_id: String(myId) }));
  }, [employees, myId, canChooseEmployee, form.employee_id, form.date]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const res = await api('/units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: form.employee_id ? Number(form.employee_id) : undefined,
        date: form.date,
        units_count: Number(form.units_count) || 0,
        notes: form.notes || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed');
      return;
    }
    setForm((f) => ({ ...f, units_count: '', notes: '' }));
    setShowForm(false);
    load();
  };

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Daily Units</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Track how many units each employee completes per day.
      </p>
      {error && <div className="error-msg">{error}</div>}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>Log units</button>
        {(isAdmin || isSupervisor) && (
          <>
            <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="form-group" style={{ width: 'auto', margin: 0 }} />
            <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} style={{ width: 'auto', margin: 0 }} />
            <select value={filters.employee_id} onChange={(e) => setFilters((f) => ({ ...f, employee_id: e.target.value }))} style={{ width: 'auto', minWidth: '140px', margin: 0 }}>
              <option value="">All employees</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </>
        )}
      </div>
      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit}>
            {canChooseEmployee && (
              <div className="form-group">
                <label>Employee</label>
                <select value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))} required>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name} {e.badge_id ? `(${e.badge_id})` : ''}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Units count</label>
              <input type="number" min="0" value={form.units_count} onChange={(e) => setForm((f) => ({ ...f, units_count: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Notes (optional)</label>
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" className="btn btn-ghost" style={{ marginLeft: '0.5rem' }} onClick={() => setShowForm(false)}>Cancel</button>
          </form>
        </div>
      )}
      <div className="card">
        {loading ? <p className="empty-state">Loading…</p> : list.length === 0 ? (
          <p className="empty-state">No daily unit records. Log units above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Units</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.employee_name}</td>
                    <td>{r.units_count}</td>
                    <td>{r.notes || '—'}</td>
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
