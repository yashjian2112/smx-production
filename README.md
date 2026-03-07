# SMX Drives – Production Tracker

Production-ready, mobile-first web app for **controller manufacturing traceability** and **workforce performance**: orders, stage-wise tracking, serial-number identity, QC/rework, approvals, and permanent logs.

## Tech stack

- **Frontend:** Next.js 14 (App Router), React, Tailwind CSS
- **Backend:** Next.js API routes, Node.js
- **Database:** Supabase (PostgreSQL) with Prisma ORM
- **Auth:** Cookie-based JWT, role-based (Admin, Production Manager, Production Employee)

## Setup

### 1. Supabase project

1. Open your project: [Dashboard → valzrbhtbwhrqwecgrpg](https://supabase.com/dashboard/project/valzrbhtbwhrqwecgrpg).
2. Go to **Project Settings → Database**.
3. Under **Connection string**, choose **URI** and copy:
   - **Transaction** (pooler, port **6543**) → use for `DATABASE_URL`
   - **Session** (direct, port **5432**) → use for `DIRECT_URL`
4. Replace `[YOUR-PASSWORD]` with your database password (same as you set when creating the project).

**Get your strings (one click):**  
[**Connect → your project**](https://supabase.com/dashboard/project/valzrbhtbwhrqwecgrpg/settings/database) → copy **Session** URI into `DATABASE_URL` and **Direct connection** into `DIRECT_URL` in `.env`.

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase `DATABASE_URL` and `DIRECT_URL`, and set `JWT_SECRET`.

### 3. Database schema and seed

```bash
npm install
npx prisma generate
npx prisma db push
npm run db:seed
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Demo logins

| Email            | Password   | Role                |
|------------------|------------|---------------------|
| admin@smx.com    | admin123   | Admin               |
| manager@smx.com  | manager123 | Production Manager  |
| emp@smx.com       | emp123     | Production Employee |

## Features

- **Roles:** Admin (full), Production Manager (orders, approvals, reports), Production Employee (assigned work only)
- **Serial format:** `SMX` + model (4 digits) + year (2) + sequence (3), e.g. `SMX100026001`
- **Stages:** Powerstage → Brainboard → Controller Assembly → QC & Software → Final Assembly; Rework returns to QC
- **Approval:** Employee submits → status “Waiting Approval” → Manager approves or rejects
- **QC:** Pass → move to Final Assembly; Fail → rework record, optional detected/source stage
- **Timeline:** Append-only log per controller (order, serial, stage, status, user, remarks)
- **Mobile-first:** Bottom nav, touch-friendly, card layout, PWA-ready

## Scripts

- `npm run dev` – start dev server
- `npm run build` / `npm run start` – production
- `npm run db:generate` – Prisma generate
- `npm run db:push` – push schema to Supabase (no migrations)
- `npm run db:migrate` – run migrations
- `npm run db:seed` – seed users, product, order, sample serials
- `npm run db:studio` – Prisma Studio (opens DB in browser)

## Env variables

| Variable             | Description                                      |
|----------------------|--------------------------------------------------|
| `DATABASE_URL`       | Supabase connection pooler URI (port 6543)       |
| `DIRECT_URL`         | Supabase direct connection URI (port 5432)      |
| `JWT_SECRET`         | Secret for session JWT                           |
| `NEXT_PUBLIC_APP_URL`| App URL (optional)                              |
