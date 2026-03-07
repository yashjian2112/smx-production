import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { api, user, isAdmin, isSupervisor } = useAuth();
  const [summary, setSummary] = useState(null);
  const [defects, setDefects] = useState([]);

  useEffect(() => {
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const to = new Date();
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    api(`/reports/summary?from=${fromStr}&to=${toStr}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setSummary);

    api(`/reports/defects?from=${fromStr}&to=${toStr}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setDefects);
  }, [api]);

  const myStats = summary?.by_employee?.find((e) => Number(e.id) === Number(user?.employee_id));
  const topEmployees = summary?.by_employee?.slice(0, 5) || [];

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Dashboard</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Welcome, {user?.username}. {user?.role === 'employee' ? "Here's your activity." : 'Overview of production and defects.'}
      </p>

      {user?.role === 'employee' && myStats && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>My stats (last 30 days)</h3>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total units</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{myStats.total_units || 0}</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Days worked</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{myStats.days_worked || 0}</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Controllers (defect rate)</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {myStats.controllers?.total ?? 0} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>({myStats.controllers?.defect_rate ?? 0}%)</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <Link to="/units" className="btn btn-primary">Log today's units</Link>
            <Link to="/controllers" className="btn btn-ghost" style={{ marginLeft: '0.5rem' }}>Register controller</Link>
          </div>
        </div>
      )}

      {(isAdmin || isSupervisor) && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>Top producers (last 30 days)</h3>
            {topEmployees.length === 0 ? (
              <p className="empty-state">No data yet. Add daily units and controllers.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Total units</th>
                      <th>Days worked</th>
                      <th>Controllers</th>
                      <th>Defect rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topEmployees.map((e) => (
                      <tr key={e.id}>
                        <td>{e.name} {e.badge_id && <span style={{ color: 'var(--text-muted)' }}>({e.badge_id})</span>}</td>
                        <td>{e.total_units}</td>
                        <td>{e.days_worked}</td>
                        <td>{e.controllers?.total ?? 0}</td>
                        <td>{e.controllers?.defect_rate ?? 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ marginTop: '1rem' }}>
              <Link to="/reports" className="btn btn-primary">Full reports</Link>
            </div>
          </div>

          {defects.length > 0 && (
            <div className="card">
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>Recent defects / rework</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Serial</th>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {defects.slice(0, 10).map((c) => (
                      <tr key={c.id}>
                        <td className="serial-mono">{c.serial_number}</td>
                        <td>{c.employee_name}</td>
                        <td>{c.produced_date}</td>
                        <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                        <td>{c.defect_notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link to="/controllers?status=defect" className="btn btn-ghost" style={{ marginTop: '0.5rem' }}>View all defects</Link>
            </div>
          )}
        </>
      )}
    </>
  );
}

