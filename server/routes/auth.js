import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, signToken, authMiddleware } from '../auth.js';

export const authRoutes = Router();

authRoutes.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = signToken({
    id: user.id,
    username: user.username,
    role: user.role,
    employee_id: user.employee_id,
  });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, employee_id: user.employee_id } });
});

authRoutes.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, role, employee_id FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

authRoutes.post('/register', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can register users' });
  }
  const { username, password, role, employee_id } = req.body || {};
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password, and role required' });
  }
  if (!['admin', 'supervisor', 'employee'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  try {
    const hash = hashPassword(password);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, role, employee_id) VALUES (?, ?, ?, ?)'
    ).run(username, hash, role, employee_id || null);
    res.status(201).json({ id: result.lastInsertRowid, username, role, employee_id: employee_id || null });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    throw e;
  }
});
