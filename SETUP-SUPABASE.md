# StockSense v2.0 — Supabase Setup Guide

Complete steps to get the application running with a Supabase PostgreSQL backend.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 8 |
| Supabase account | [supabase.com](https://supabase.com) (free tier works) |

---

## Step 1 — Create a Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com) and sign in.
2. Click **New Project**.
3. Fill in:
   - **Name**: `stocksense` (or anything you like)
   - **Database Password**: choose a strong password — **save it**, you'll need it.
   - **Region**: pick the one closest to you.
4. Click **Create new project** and wait ~2 minutes for provisioning to finish.

---

## Step 2 — Get the Direct Connection String

> **Important**: You MUST use the **direct connection** (port 5432), NOT the pooler (port 6543).  
> The app uses `BEGIN`/`COMMIT` transactions with `SELECT FOR UPDATE`, which requires a persistent connection.

1. In your Supabase project, go to **Settings → Database**.
2. Under **Connection string**, select **URI**.
3. Make sure the mode is **Session** (not Transaction/Pooler).
4. Copy the URI — it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the database password you set in Step 1.

---

## Step 3 — Run the Database Schema

1. In your Supabase project, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `supabase/schema.sql` from this project and **paste its entire contents** into the editor.
4. Click **Run** (Ctrl+Enter).
5. You should see: `Success. No rows returned.`

This creates:
- `users` table (username, password_hash, role)
- `inventory` table (10 seed items pre-loaded)
- `transactions` table (immutable — audit log)
- All triggers, indexes, and constraints

---

## Step 4 — Install Dependencies

Open a terminal in the project root and run:

```bash
npm install
```

This installs: `express`, `pg`, `express-session`, `bcrypt`, `dotenv`.

---

## Step 5 — Configure Environment Variables

1. Copy the example env file:
   ```bash
   # Windows PowerShell
   Copy-Item .env.example .env

   # macOS / Linux
   cp .env.example .env
   ```
2. Open `.env` and fill in your values:
   ```env
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   SESSION_SECRET=change-this-to-a-long-random-string-in-production
   PORT=3000
   ```
   - Paste the URI from Step 2 as `DATABASE_URL`.
   - Set `SESSION_SECRET` to any long random string (e.g. output of `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

---

## Step 6 — Seed the Users

Run the seed script once to create the default admin and staff accounts:

```bash
npm run seed
```

This inserts two users with bcrypt-hashed passwords:

| Username | Password | Role  |
|----------|----------|-------|
| `admin`  | `admin`  | admin |
| `staff`  | `staff`  | staff |

> **Security note**: Change these passwords immediately in any non-development environment.  
> You can update them in the Supabase Table Editor or via SQL:
> ```sql
> UPDATE users SET password_hash = '<new-bcrypt-hash>' WHERE username = 'admin';
> ```

---

## Step 7 — Start the Server

```bash
# Production start
npm start

# Development (auto-restarts on file changes)
npm run dev
```

The server starts on `http://localhost:3000` by default.

---

## Step 8 — Open the App

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

Log in with:
- **Username**: `admin` | **Password**: `admin` (full access)
- **Username**: `staff` | **Password**: `staff` (view + transactions only)

---

## API Endpoints Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/login` | — | Login with username/password |
| `POST` | `/api/logout` | session | Destroy session |
| `GET` | `/api/session` | — | Check auth status |
| `GET` | `/api/inventory` | user | List all inventory |
| `POST` | `/api/inventory` | admin | Add new item |
| `PUT` | `/api/inventory/:code` | user | Stock transaction (add/dispatch) |
| `PUT` | `/api/inventory/:code/details` | admin | Edit item metadata |
| `DELETE` | `/api/inventory/:code` | admin | Delete item |
| `GET` | `/api/transactions` | admin | Paginated transaction log |
| `GET` | `/api/transactions/item/:code` | user | Item transaction history |
| `GET` | `/api/low-stock` | user | Items below safety stock |
| `GET` | `/api/stats` | user | Dashboard statistics |
| `GET` | `/api/events` | user | SSE stream for real-time updates |

---

## Troubleshooting

### `ECONNREFUSED` or `connect ETIMEDOUT`
- Double-check that `DATABASE_URL` uses port **5432** (direct), not 6543.
- Ensure the Supabase project is not paused (free tier pauses after 1 week of inactivity — go to the dashboard and click **Resume**).

### `password authentication failed for user "postgres"`
- Your password contains special characters — URL-encode them in the connection string (e.g. `@` → `%40`, `#` → `%23`).

### `relation "users" does not exist`
- You haven't run `supabase/schema.sql` yet. Follow Step 3.

### Login always fails / "Invalid credentials"
- You haven't run `npm run seed` yet. Follow Step 6.
- Usernames are **case-sensitive** — use lowercase `admin` / `staff`.

### Session lost immediately after login
- `SESSION_SECRET` in `.env` must be set and not empty.
- Make sure you're accessing the app through the Node server (`localhost:3000`), not by opening the HTML file directly.

---

## Project File Structure

```
stocksense/
├── index.html              # Login page
├── dashboard.html          # Main app (tabs: Alerts, Inventory, Log Stocks, History)
├── app.js                  # Frontend logic (API-backed, v2.0)
├── style.css               # Styles
├── server.js               # Express.js API server
├── seed.js                 # One-time user seeder
├── package.json
├── .env                    # Your local config (not committed)
├── .env.example            # Template
└── supabase/
    └── schema.sql          # Full PostgreSQL schema — run in Supabase SQL Editor
```
