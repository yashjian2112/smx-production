import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';

export const reportsRoutes = Router();

reportsRoutes.use(authMiddleware);

// Summary: units per employee per day in range; defect rate by employee
reportsRoutes.get('/summary', (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || '2000-01-01';
  const toDate = to || '9999-12-31';

  const unitsByEmployee = db.prepare(`
    SELECT e.id, e.name, e.badge_id,
           SUM(du.units_count) AS total_units,
           COUNT(DISTINCT du.date) AS days_worked
    FROM employees e
    LEFT JOIN daily_units du ON du.employee_id = e.id AND du.date BETWEEN ? AND ?
    GROUP BY e.id
    ORDER BY total_units DESC
  `).all(fromDate, toDate);

  const controllersByEmployee = db.prepare(`
    SELECT employee_id,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'defect' THEN 1 ELSE 0 END) AS defects,
           SUM(CASE WHEN status = 'rework' THEN 1 ELSE 0 END) AS rework
    FROM controllers
    WHERE produced_date BETWEEN ? AND ?
    GROUP BY employee_id
  `).all(fromDate, toDate);

  const defectMap = Object.fromEntries(controllersByEmployee.map(r => [
    r.employee_id,
    { total: r.total, defects: r.defects, rework: r.rework, defect_rate: r.total ? ((r.defects + r.rework) / r.total * 100).toFixed(1) : 0 }
  ]));

  const summary = unitsByEmployee.map(e => ({
    ...e,
    controllers: defectMap[e.id] || { total: 0, defects: 0, rework: 0, defect_rate: 0 },
  }));

  res.json({ from: fromDate, to: toDate, by_employee: summary });
});

// Defect list for tracing problems
reportsRoutes.get('/defects', (req, res) => {
  const { from, to } = req.query;
  let sql = `
    SELECT c.*, e.name AS employee_name
    FROM controllers c
    JOIN employees e ON e.id = c.employee_id
    WHERE c.status IN ('defect', 'rework')
  `;
  const params = [];
  if (from) { sql += ' AND c.produced_date >= ?'; params.push(from); }
  if (to) { sql += ' AND c.produced_date <= ?'; params.push(to); }
  sql += ' ORDER BY c.produced_date DESC ';
  const list = db.prepare(sql).all(...params);
  res.json(list);
});
