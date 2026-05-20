# 🌿 ChamaHive

A Sacco & Chama management system for Kenyan investment groups — built with React, Vite, and Supabase.

## Stack
- React 18 + Vite 5
- Supabase (PostgreSQL + Auth)
- Recharts, DM Sans

## Features
- 📊 Dashboard — fund allocation, monthly contributions chart, loan alerts
- 💰 Contributions — manual entry or bulk Excel/CSV upload
- 🏦 Loans — request, approve/reject, repay (10% interest/mo)
- 👥 Members — enroll, edit, remove, assign roles
- 🌙 Dark mode + responsive (mobile drawer & bottom nav)
- 📱 M-Pesa (Daraja API) — *coming soon*

## Quick Start

```bash
git clone https://github.com/pnzyoki/Chama-Hive.git
cd Chama-Hive
npm install
```

Add a `.env` file:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

```bash
npm run dev
```

## Roles

| Role | Access |
|---|---|
| `member` | Own data + loan requests |
| `treasurer` | + Contributions & repayments |
| `chairman` | + Approve / reject loans |
| `admin` | Full access |

## Excel Import
Column `Name` (must match enrolled member) + month columns `Jan … Dec` with KES amounts.

---
MIT © [pnzyoki](https://github.com/pnzyoki)
