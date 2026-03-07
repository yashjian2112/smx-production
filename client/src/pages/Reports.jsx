import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Reports() {
  const { api } = useAuth();
  const [summary, setSummary] = useState(null);
  const [defects, setDefects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ from: '', to: '' });

  useEffect(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    setRange({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
  }, []);

  useEffect(() => {
    if (!range.from || !range.to) return;
    setLoading(true);
    Promise.all([
      api(`/reports/summary?from=${range.from}&to=${range.to}`).then((r) => r.ok ? r.json() : null),
      api(`/reports/defects?from=${range.from}&to=${range.to}`).then((r) => r.ok ? r.json() : []),
    ]).then(([s, d]) => {
      setSummary(s);
      setDefects(d);
    }).finally(() => setLoading(false));
  }, [api, range.from, range.to]);

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Reports</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Productivity and defect summary by employee. Use date range to analyze periods.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
      </div>
      {loading ? (
        <p className="empty-state">Loading…</p>
      ) : (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem 0' }}>Summary by employee ({range.from} → {range.to})</h3>
            {!summary?.by_employee?.length ? (
              <p className="empty-state">No data in this range.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Badge</th>
                      <th>Total units</th>
                      <th>Days worked</th>
                      <th>Controllers</th>
                      <th>Defects</th>
                      <th>Rework</th>
                      <th>Defect rate %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.by_employee.map((e) => (
                      <tr key={e.id}>
                        <td>{e.name}</td>
                        <td>{e.badge_id || '—'}</td>
                        <td>{e.total_units}</td>
                        <td>{e.days_worked}</td>
                        <td>{e.controllers?.total ?? 0}</td>
                        <td>{e.controllers?.defects ?? 0}</td>
                        <td>{e.controllers?.rework ?? 0}</td>
                        <td>{e.controllers?.defect_rate ?? 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem 0' }}>Defects & rework (for problem tracing)</h3>
            {defects.length === 0 ? (
              <p className="empty-state">No defects in this range.</p>
            ) : (
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
                    {defects.map((c) => (
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
            )}
          </div>
        </>
      )}
    </>
  );
}
