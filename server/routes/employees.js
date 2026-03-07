import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';

export const employeeRoutes = Router();

employeeRoutes.use(authMiddleware);

employeeRoutes.get('/', (req, res) => {
  const list = db.prepare(`
    SELECT e.*, (SELECT COUNT(*) FROM daily_units du WHERE du.employee_id = e.id) AS records_count
    FROM employees e ORDER BY e.name
  `).all();
  res.json(list);
});

employeeRoutes.get('/:id', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json(emp);
});

employeeRoutes.post('/', requireRole('admin', 'supervisor'), (req, res) => {
  const { name, badge_id } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare('INSERT INTO employees (name, badge_id) VALUES (?, ?)').run(name || '', badge_id || null);
  res.status(201).json({ id: result.lastInsertRowid, name, badge_id: badge_id || null });
});

employeeRoutes.patch('/:id', requireRole('admin', 'supervisor'), (req, res) => {
  const { name, badge_id } = req.body || {};
  db.prepare('UPDATE employees SET name = COALESCE(?, name), badge_id = COALESCE(?, badge_id) WHERE id = ?')
    .run(name ?? null, badge_id !== undefined ? badge_id : null, req.params.id);
  if (db.prepare('SELECT changes()').get().changes === 0) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  res.json(emp);
});

employeeRoutes.delete('/:id', requireRole('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
  res.status(204).send();
});
