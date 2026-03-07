import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Users() {
  const { api } = useAuth();
  const [form, setForm] = useState({ username: '', password: '', role: 'employee', employee_id: '' });
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  React.useEffect(() => {
    api('/employees').then((r) => r.ok ? r.json() : []).then(setEmployees);
  }, [api]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const res = await api('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        employee_id: form.employee_id ? Number(form.employee_id) : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Failed');
      return;
    }
    setSuccess(`User "${form.username}" created.`);
    setForm({ username: '', password: '', role: 'employee', employee_id: '' });
  };

  return (
    <>
      <h2 style={{ marginTop: 0 }}>User management</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Create login accounts. Link employees so they can log their own units and controllers.
      </p>
      {error && <div className="error-msg">{error}</div>}
      {success && <div style={{ background: 'rgba(52, 211, 153, 0.15)', color: 'var(--success)', padding: '0.6rem', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>{success}</div>}
      <div className="card" style={{ maxWidth: '420px' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="admin">Admin</option>
              <option value="supervisor">Supervisor</option>
              <option value="employee">Employee</option>
            </select>
          </div>
          {form.role === 'employee' && (
            <div className="form-group">
              <label>Link to employee</label>
              <select value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}>
                <option value="">— None —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.badge_id || e.id})</option>)}
              </select>
            </div>
          )}
          <button type="submit" className="btn btn-primary">Create user</button>
        </form>
      </div>
    </>
  );
}
