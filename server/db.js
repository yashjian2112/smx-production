import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'production.db');

export const db = new Database(dbPath);

// Roles: admin, supervisor, employee
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'employee')),
      employee_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      badge_id TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      units_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, date),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS controllers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_number TEXT UNIQUE NOT NULL,
      employee_id INTEGER NOT NULL,
      produced_date TEXT NOT NULL,
      status TEXT DEFAULT 'ok' CHECK(status IN ('ok', 'defect', 'rework')),
      defect_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE INDEX IF NOT EXISTS idx_controllers_serial ON controllers(serial_number);
    CREATE INDEX IF NOT EXISTS idx_controllers_employee ON controllers(employee_id);
    CREATE INDEX IF NOT EXISTS idx_controllers_date ON controllers(produced_date);
    CREATE INDEX IF NOT EXISTS idx_daily_units_employee_date ON daily_units(employee_id, date);
  `);
}
