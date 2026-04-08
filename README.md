# 🌿 ChamaHive

A modern Sacco & Chama management system for Kenyan investment groups — built with React, Vite, and Supabase.

## Stack
- **Frontend** — React 18 + Vite 5
- **Backend** — Supabase (PostgreSQL + Auth)
- **Charts** — Recharts
- **Styling** — Vanilla CSS-in-JS, DM Sans

## Features
- 📊 **Dashboard** — fund allocation pie chart, monthly contributions bar chart, loan alerts
- 💰 **Contributions** — manual entry or bulk Excel/CSV upload with preview
- 🏦 **Loans** — request, approve/reject, repay with auto interest accrual (10%/mo)
- 👥 **Members** — enroll, edit, remove, assign roles (member / treasurer / chairman / admin)
- 🌙 **Dark mode** + fully responsive (mobile drawer + bottom nav)
- 📱 **M-Pesa** integration (Daraja API) — *coming soon*

## Quick Start

```bash
git clone https://github.com/pnzyoki/Chama-Hive.git
cd Chama-Hive
npm install
```

Create a `.env` file:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

```bash
npm run dev
```

## Supabase Schema

```sql
create table members (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid references auth.users(id),
  name text, phone text, email text, id_number text,
  role text default 'member',
  avatar text, join_date date, next_of_kin text, nok_phone text
);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id),
  month text, year int, amount numeric,
  unique(member_id, month, year)
);

create table loans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id),
  amount numeric, purpose text,
  status text default 'pending',
  interest_rate numeric default 0.10,
  paid numeric default 0,
  date date, due_date date, approved_by uuid
);
```

## Roles

| Role | Access |
|---|---|
| `member` | Own data + loan requests |
| `treasurer` | + Record contributions, repayments |
| `chairman` | + Approve / reject loans |
| `admin` | Full access — enroll & manage members |

## Excel Import Format
Column `Name` (must match enrolled name) + month columns `Jan Feb ... Dec` with KES amounts.

---
MIT © [pnzyoki](https://github.com/pnzyoki)
