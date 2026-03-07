import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import { authRoutes } from './routes/auth.js';
import { employeeRoutes } from './routes/employees.js';
import { unitsRoutes } from './routes/units.js';
import { controllersRoutes } from './routes/controllers.js';
import { reportsRoutes } from './routes/reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
initDb();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/units', unitsRoutes);
app.use('/api/controllers', controllersRoutes);
app.use('/api/reports', reportsRoutes);

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
