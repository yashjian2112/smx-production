import { initDb, db } from './db.js';
import { hashPassword } from './auth.js';

initDb();

const employees = [
  { name: 'Raj Kumar', badge_id: 'E001' },
  { name: 'Priya Sharma', badge_id: 'E002' },
  { name: 'Amit Singh', badge_id: 'E003' },
];

for (const e of employees) {
  try {
    db.prepare('INSERT INTO employees (name, badge_id) VALUES (?, ?)').run(e.name, e.badge_id);
  } catch (err) {
    if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
  }
}

const empIds = db.prepare('SELECT id FROM employees ORDER BY id').all().map(r => r.id);

const users = [
  { username: 'admin', password: 'admin123', role: 'admin', employee_id: null },
  { username: 'supervisor', password: 'super123', role: 'supervisor', employee_id: null },
  { username: 'raj', password: 'emp123', role: 'employee', employee_id: empIds[0] },
  { username: 'priya', password: 'emp123', role: 'employee', employee_id: empIds[1] },
  { username: 'amit', password: 'emp123', role: 'employee', employee_id: empIds[2] },
];

for (const u of users) {
  try {
    const hash = hashPassword(u.password);
    db.prepare('INSERT INTO users (username, password_hash, role, employee_id) VALUES (?, ?, ?, ?)')
      .run(u.username, hash, u.role, u.employee_id);
  } catch (err) {
    if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
  }
}

const today = new Date().toISOString().slice(0, 10);
db.prepare('INSERT OR REPLACE INTO daily_units (employee_id, date, units_count, notes) VALUES (?, ?, ?, ?)')
  .run(empIds[0], today, 45, null);
db.prepare('INSERT OR REPLACE INTO daily_units (employee_id, date, units_count, notes) VALUES (?, ?, ?, ?)')
  .run(empIds[1], today, 52, null);
db.prepare('INSERT OR REPLACE INTO daily_units (employee_id, date, units_count, notes) VALUES (?, ?, ?, ?)')
  .run(empIds[2], today, 38, null);

const serials = ['CTL-2024-001', 'CTL-2024-002', 'CTL-2024-003', 'CTL-2024-004', 'CTL-2024-005'];
for (let i = 0; i < serials.length; i++) {
  try {
    db.prepare(`
      INSERT INTO controllers (serial_number, employee_id, produced_date, status, defect_notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(serials[i], empIds[i % 3], today, i === 2 ? 'defect' : 'ok', i === 2 ? 'Test defect for demo' : null);
  } catch (err) {
    if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') continue;
  }
}

console.log('Seed done. Login: admin/admin123, supervisor/super123, raj/emp123, priya/emp123, amit/emp123');
