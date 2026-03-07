import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';

export const unitsRoutes = Router();

unitsRoutes.use(authMiddleware);

// List daily units: ?employee_id=&from=&to=
unitsRoutes.get('/', (req, res) => {
  const { employee_id, from, to } = req.query;
  let sql = `
    SELECT du.*, e.name AS employee_name
    FROM daily_units du
    JOIN employees e ON e.id = du.employee_id
    WHERE 1=1
  `;
  const params = [];
  if (employee_id) { sql += ' AND du.employee_id = ?'; params.push(employee_id); }
  if (from) { sql += ' AND du.date >= ?'; params.push(from); }
  if (to) { sql += ' AND du.date <= ?'; params.push(to); }
  sql += ' ORDER BY du.date DESC, e.name ';
  const list = db.prepare(sql).all(...params);
  res.json(list);
});

// Upsert my own daily units (employee) or any (supervisor/admin)
unitsRoutes.post('/', (req, res) => {
  const { employee_id, date, units_count, notes } = req.body || {};
  const effectiveEmployeeId = (req.user.role === 'employee' ? req.user.employee_id : employee_id) || null;
  if (!effectiveEmployeeId) return res.status(400).json({ error: 'Employee required' });
  if (!date || units_count == null) return res.status(400).json({ error: 'date and units_count required' });
  if (req.user.role === 'employee' && Number(effectiveEmployeeId) !== Number(req.user.employee_id)) {
    return res.status(403).json({ error: 'Can only log own units' });
  }
  const count = Math.max(0, parseInt(units_count, 10));
  try {
    db.prepare(`
      INSERT INTO daily_units (employee_id, date, units_count, notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET units_count = ?, notes = ?
    `).run(effectiveEmployeeId, date, count, notes || null, count, notes || null);
    const row = db.prepare('SELECT du.*, e.name AS employee_name FROM daily_units du JOIN employees e ON e.id = du.employee_id WHERE du.employee_id = ? AND du.date = ?')
      .get(effectiveEmployeeId, date);
    res.json(row);
  } catch (e) {
    if (e.message?.includes('FOREIGN KEY')) return res.status(400).json({ error: 'Invalid employee_id' });
    throw e;
  }
});

unitsRoutes.delete('/:id', requireRole('admin', 'supervisor'), (req, res) => {
  const result = db.prepare('DELETE FROM daily_units WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
