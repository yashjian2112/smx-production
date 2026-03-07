import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';

export const controllersRoutes = Router();

controllersRoutes.use(authMiddleware);

// List: ?serial=&employee_id=&from=&to=&status=
controllersRoutes.get('/', (req, res) => {
  const { serial, employee_id, from, to, status } = req.query;
  let sql = `
    SELECT c.*, e.name AS employee_name
    FROM controllers c
    JOIN employees e ON e.id = c.employee_id
    WHERE 1=1
  `;
  const params = [];
  if (serial) { sql += ' AND c.serial_number LIKE ?'; params.push(`%${serial}%`); }
  if (employee_id) { sql += ' AND c.employee_id = ?'; params.push(employee_id); }
  if (from) { sql += ' AND c.produced_date >= ?'; params.push(from); }
  if (to) { sql += ' AND c.produced_date <= ?'; params.push(to); }
  if (status) { sql += ' AND c.status = ?'; params.push(status); }
  sql += ' ORDER BY c.produced_date DESC, c.serial_number ';
  const list = db.prepare(sql).all(...params);
  res.json(list);
});

controllersRoutes.get('/by-serial/:serial', (req, res) => {
  const row = db.prepare(`
    SELECT c.*, e.name AS employee_name
    FROM controllers c
    JOIN employees e ON e.id = c.employee_id
    WHERE c.serial_number = ?
  `).get(req.params.serial);
  if (!row) return res.status(404).json({ error: 'Controller not found' });
  res.json(row);
});

// Add controller (who made it, serial, date, optional status/defect)
controllersRoutes.post('/', (req, res) => {
  const { serial_number, employee_id, produced_date, status, defect_notes } = req.body || {};
  const effectiveEmployeeId = (req.user.role === 'employee' ? req.user.employee_id : employee_id) || null;
  if (!serial_number || !effectiveEmployeeId || !produced_date) {
    return res.status(400).json({ error: 'serial_number, employee_id, and produced_date required' });
  }
  if (req.user.role === 'employee' && Number(effectiveEmployeeId) !== Number(req.user.employee_id)) {
    return res.status(403).json({ error: 'Can only log own controllers' });
  }
  const st = status && ['ok', 'defect', 'rework'].includes(status) ? status : 'ok';
  try {
    const result = db.prepare(`
      INSERT INTO controllers (serial_number, employee_id, produced_date, status, defect_notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(serial_number.trim(), effectiveEmployeeId, produced_date, st, defect_notes || null);
    const row = db.prepare(`
      SELECT c.*, e.name AS employee_name FROM controllers c JOIN employees e ON e.id = c.employee_id WHERE c.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Serial number already exists' });
    if (e.message?.includes('FOREIGN KEY')) return res.status(400).json({ error: 'Invalid employee_id' });
    throw e;
  }
});

controllersRoutes.patch('/:id', (req, res) => {
  const { status, defect_notes } = req.body || {};
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM controllers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const newStatus = status && ['ok', 'defect', 'rework'].includes(status) ? status : existing.status;
  db.prepare('UPDATE controllers SET status = ?, defect_notes = ? WHERE id = ?')
    .run(newStatus, defect_notes !== undefined ? defect_notes : existing.defect_notes, id);
  const row = db.prepare(`
    SELECT c.*, e.name AS employee_name FROM controllers c JOIN employees e ON e.id = c.employee_id WHERE c.id = ?
  `).get(id);
  res.json(row);
});

controllersRoutes.delete('/:id', requireRole('admin', 'supervisor'), (req, res) => {
  const result = db.prepare('DELETE FROM controllers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
