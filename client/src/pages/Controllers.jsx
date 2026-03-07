import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';

export default function Controllers() {
  const { api, user, isAdmin, isSupervisor } = useAuth();
  const [searchParams] = useSearchParams();
  const [list, setList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ serial_number: '', employee_id: '', produced_date: '', status: 'ok', defect_notes: '' });
  const [filters, setFilters] = useState({ serial: '', employee_id: '', from: '', to: '', status: searchParams.get('status') || '' });
  const [error, setError] = useState('');
  const [traceSerial, setTraceSerial] = useState('');
  const [traceResult, setTraceResult] = useState(null);

  const canChooseEmployee = isAdmin || isSupervisor;
  const myId = user?.employee_id;

  useEffect(() => {
    api('/employees').then((r) => r.ok ? r.json() : []).then(setEmployees);
  }, [api]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams(filters);
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    api(`/controllers?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setList)
      .finally(() => setLoading(false));
  };

  useEffect(load, [api, filters.serial, filters.employee_id, filters.from, filters.to, filters.status]);

  useEffect(() => {
    if (!form.produced_date) setForm((f) => ({ ...f, produced_date: new Date().toISOString().slice(0, 10) }));
    if (canChooseEmployee && employees.length && !form.employee_id && myId) setForm((f) => ({ ...f, employee_id: String(myId) }));
    else if (canChooseEmployee && employees.length && !form.employee_id) setForm((f) => ({ ...f, employee_id: String(employees[0]?.id || '') }));
    if (!canChooseEmployee && myId) setForm((f) => ({ ...f, employee_id: String(myId) }));
  }, [employees, myId, canChooseEmployee, form.employee_id, form.produced_date]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const res = await api('/controllers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serial_number: form.serial_number.trim(),
        employee_id: form.employee_id ? Number(form.employee_id) : undefined,
        produced_date: form.produced_date,
        status: form.status,
        defect_notes: form.defect_notes || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed');
      return;
    }
    setForm((f) => ({ ...f, serial_number: '', defect_notes: '', status: 'ok' }));
    setShowForm(false);
    load();
  };

  const updateStatus = async (id, status, defect_notes) => {
    const res = await api(`/controllers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, defect_notes }),
    });
    if (res.ok) load();
  };

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Controllers</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Register controllers with serial numbers to trace defects. Search by serial to find who made a unit and when.
      </p>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Trace serial number</strong>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 0.5rem 0' }}>Enter a serial to see who made it and where problems were reported.</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="e.g. CTL-2024-001" value={traceSerial} onChange={(e) => { setTraceSerial(e.target.value); setTraceResult(null); }} className="serial-mono" style={{ width: '200px' }} />
          <button type="button" className="btn btn-primary" onClick={async () => { if (!traceSerial.trim()) return; setTraceResult(null); const r = await api(`/controllers/by-serial/${encodeURIComponent(traceSerial.trim())}`); if (r.ok) setTraceResult(await r.json()); else setTraceResult({ error: 'Not found' }); }}>Look up</button>
        </div>
        {traceResult && (traceResult.error ? <p style={{ margin: '0.75rem 0 0', color: 'var(--danger)' }}>Controller not found.</p> : <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }}><span className="serial-mono">{traceResult.serial_number}</span> → <strong>{traceResult.employee_name}</strong> · {traceResult.produced_date} · <span className={`badge badge-${traceResult.status}`}>{traceResult.status}</span> {traceResult.defect_notes && <> · {traceResult.defect_notes}</>}</div>)}
      </div>
      {error && <div className="error-msg">{error}</div>}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>Register controller</button>
        <input type="text" placeholder="Serial number" value={filters.serial} onChange={(e) => setFilters((f) => ({ ...f, serial: e.target.value }))} style={{ width: '160px', margin: 0 }} />
        <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} style={{ margin: 0 }} />
        <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} style={{ margin: 0 }} />
        {(isAdmin || isSupervisor) && (
          <select value={filters.employee_id} onChange={(e) => setFilters((f) => ({ ...f, employee_id: e.target.value }))} style={{ minWidth: '140px', margin: 0 }}>
            <option value="">All employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} style={{ margin: 0 }}>
          <option value="">All status</option>
          <option value="ok">OK</option>
          <option value="defect">Defect</option>
          <option value="rework">Rework</option>
        </select>
      </div>
      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Serial number</label>
              <input value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} placeholder="e.g. CTL-2024-001" className="serial-mono" required />
            </div>
            {canChooseEmployee && (
              <div className="form-group">
                <label>Employee</label>
                <select value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))} required>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name} {e.badge_id ? `(${e.badge_id})` : ''}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Produced date</label>
              <input type="date" value={form.produced_date} onChange={(e) => setForm((f) => ({ ...f, produced_date: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="ok">OK</option>
                <option value="defect">Defect</option>
                <option value="rework">Rework</option>
              </select>
            </div>
            {form.status !== 'ok' && (
              <div className="form-group">
                <label>Defect / rework notes</label>
                <textarea value={form.defect_notes} onChange={(e) => setForm((f) => ({ ...f, defect_notes: e.target.value }))} rows={2} />
              </div>
            )}
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" className="btn btn-ghost" style={{ marginLeft: '0.5rem' }} onClick={() => setShowForm(false)}>Cancel</button>
          </form>
        </div>
      )}
      <div className="card">
        {loading ? <p className="empty-state">Loading…</p> : list.length === 0 ? (
          <p className="empty-state">No controllers. Register one above or adjust filters.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Defect notes</th>
                  {(isAdmin || isSupervisor) && <th></th>}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="serial-mono">{r.serial_number}</td>
                    <td>{r.employee_name}</td>
                    <td>{r.produced_date}</td>
                    <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                    <td>{r.defect_notes || '—'}</td>
                    {(isAdmin || isSupervisor) && (
                      <td>
                        <select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value, r.defect_notes)} style={{ padding: '0.25rem', fontSize: '0.85rem' }}>
                          <option value="ok">OK</option>
                          <option value="defect">Defect</option>
                          <option value="rework">Rework</option>
                        </select>
                      </td>
                    )}
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
