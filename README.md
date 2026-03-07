# StockSense — Inventory Management System
**Software Engineering 1 | Group 3 | BM1**

| Role | Name |
|---|---|
| Project Manager | Ranzel Virtucio |
| Business Analyst | Raphael Agapito |

---

## Overview

StockSense is a web-based inventory management system built with a Node.js/Express backend and a plain HTML/CSS/JavaScript frontend, backed by PostgreSQL. It supports role-based access (Admin and Staff), real-time inventory updates via Server-Sent Events (SSE), transaction history, low-stock alerts, and CSV export.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Web Framework | Express 4 |
| Database | PostgreSQL |
| Auth | express-session + bcryptjs |
| Frontend | HTML5 / CSS3 / Vanilla JS |
| Real-time | Server-Sent Events (SSE) |
| Icons | Font Awesome 6 |
| Fonts | Google Fonts — Inter |

---

## Project Structure

```
INVENTORY-SYSTEM-SOFT-ENG-1-BM1/
│
├── backend files/
│   ├── server.js          # Express app — all API routes
│   ├── database.js        # PostgreSQL pool + schema init
│   ├── package.json       # Dependencies
│   └── .env               # Environment variables (not committed)
│
├── frontend files/
│   ├── index.html         # Login page
│   ├── signup.html        # Registration page
│   ├── dashboard.html     # Main dashboard (inventory, history, alerts)
│   ├── app.js             # Frontend logic (session, CRUD, SSE, export)
│   ├── style.css          # Login / signup styles
│   └── dashboard.css      # Dashboard styles
│
├── spec/
│   ├── spec_helper.rb     # RSpec HTTP helper + server connectivity check
│   └── stocksense_api_spec.rb  # RSpec UAT suite (35 tests)
├── .rspec                 # RSpec default options
├── test-uat.js            # Automated UAT API test runner (Node.js, 36 tests)
├── Test Script_StockSense_Group_3_BM1 - UAT Cases.csv
└── README.md
```

---

## Prerequisites

- **Node.js** v18 or later
- A **Supabase** project (free tier is sufficient — [supabase.com](https://supabase.com))

---

## Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/Zel143/INVENTORY-SYSTEM-SOFT-ENG-1-BM1.git
cd INVENTORY-SYSTEM-SOFT-ENG-1-BM1
```

### 2. Install dependencies

```bash
cd "backend files"
npm install
```

### 3. Set up the Supabase database

1. Create a free project at [supabase.com](https://supabase.com)
2. In your project, go to **SQL Editor**
3. Copy the full contents of `spec/supabase/schema.sql` and run it — this creates all required tables
4. Go to **Settings → Database** and copy the **Transaction pooler** connection string

### 4. Configure environment variables

Create a `.env` file inside the `backend files/` folder (or edit the existing one):

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<host>.pooler.supabase.com:5432/postgres
SESSION_SECRET=your-random-secret
PORT=3000
```

Replace the values with your actual Supabase project connection string from **Settings → Database → Transaction pooler**.

> The `.env` file is **not committed** (it is listed in `.gitignore`). Never share or commit this file.

### 5. Start the server

```bash
cd "backend files"
node server.js
```

The server will:
1. Connect to Supabase PostgreSQL
2. Seed default users if the `users` table is empty
3. Start listening on **http://localhost:3000**

---

## Default Login Credentials

| Username | Password | Role |
|---|---|---|
| `admin` | `admin` | Administrator |
| `staff` | `staff` | Staff |

> Change these after first login in a production environment.

---

## Features

### Authentication
- Login with username + password (bcrypt-hashed)
- Account lockout after **5 failed attempts** (HTTP 429)
- Admin can view and clear lockouts via API
- Session-based auth with 2-hour timeout
- Password reset via 6-digit time-limited code (15 min TTL)
- User registration via `/signup.html`

### Inventory Management
- View all inventory items with live search and column sorting
- Add new items (Admin only) — code, name, description, vendor, delivery date, stock levels, warranty dates
- Edit item metadata and allocation (Admin only)
- Delete items with automatic audit trail entry (Admin only)
- Duplicate SKU and negative stock protection
- Max ceiling / min threshold alerts

### Dashboard
- Metric cards: Total SKUs, Allocated Stock, Low Stock, Overstocked
- Low-stock alert panel
- Real-time updates via Server-Sent Events — no page refresh needed

### Transaction History (Admin only)
- Full audit trail of all additions, dispatches, and deletions
- Paginated, searchable, and sortable
- CSV export

### Real-time (SSE)
- All connected clients receive instant push updates when inventory changes

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/session` | — | Check current session |
| `POST` | `/api/login` | — | Login |
| `POST` | `/api/logout` | Any | Logout |
| `POST` | `/api/register` | — | Register new account |
| `POST` | `/api/forgot-password` | — | Generate password reset code |
| `POST` | `/api/verify-reset-code` | — | Verify reset code |

### Inventory

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/inventory` | Any | List all items |
| `GET` | `/api/inventory/:code` | Any | Get single item |
| `POST` | `/api/inventory` | Admin | Add item |
| `PUT` | `/api/inventory/:code` | Any | Dispatch or restock |
| `PUT` | `/api/inventory/:code/details` | Admin | Edit item metadata |
| `DELETE` | `/api/inventory/:code` | Admin | Delete item |

### Stats & Alerts

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/stats` | Any | Dashboard metric counts |
| `GET` | `/api/low-stock` | Any | Items at or below min threshold |

### Transactions

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/transactions` | Admin | Full history (paginated) |
| `GET` | `/api/transactions/item/:code` | Any | Per-item history |

### Admin — Lockout Management

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/lockouts` | Admin | List all accounts with failed attempts |
| `DELETE` | `/api/admin/lockout/:username` | Admin | Clear a user's lockout |

### Real-time

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/events` | Any | SSE stream for live inventory updates |

---

## Running the UAT Test Suite

Both test suites require the backend server to be running. Use **two separate terminals**.

### How to open a second terminal in VS Code

- Click the **+** icon in the terminal panel (top-right of the Terminal tab), or
- Press `Ctrl+Shift+5` to split the current terminal, or
- Go to **Terminal → New Terminal** from the menu bar.

---

### Terminal 1 — Start the server

```powershell
cd "e:\INVENTORY-SYSTEM-SOFT-ENG-1-BM1\backend files"
node server.js
```

Leave this terminal running. The server listens on **http://localhost:3000**.

---

### Terminal 2 — Run tests

Open a second terminal, then run either or both suites:

**RSpec suite** (Ruby — professor-required, 36 tests, TC-7 through TC-10b):

```powershell
cd "e:\INVENTORY-SYSTEM-SOFT-ENG-1-BM1"
rspec spec/stocksense_api_spec.rb
```

Expected output: **36 examples, 0 failures**

**Node.js suite** (original, 36 tests):

```powershell
cd "e:\INVENTORY-SYSTEM-SOFT-ENG-1-BM1"
node test-uat.js
```

Expected output: **36 / 36 PASS**

---

### Prerequisites for RSpec

- Ruby 3.x must be installed (`ruby -v` to verify)
- Install RSpec once: `gem install rspec --no-document`

Both suites cover authentication, inventory CRUD, dispatch/restock validation, history access control, pagination, and database connectivity.

---

## Development Mode (auto-restart)

```bash
cd "backend files"
npm run dev
```

This uses `nodemon` to automatically restart the server on file changes.

---

## UAT Status

| Area | Status |
|---|---|
| Backend API — Node.js (36 automated tests) | PASS |
| Backend API — RSpec/Ruby (36 automated tests, +TC-10b) | PASS |
| Login / Logout / Session | PASS |
| Account lockout TC-10 (15-min rolling window, auto-reset) | FIXED & PASS |
| TC-11 Case sensitivity | FIXED & PASS |
| TC-12 SQL injection | FIXED & PASS |
| Password reset flow | PASS |
| Inventory CRUD | PASS |
| Dispatch / Restock validation | PASS |
| Transaction history + export | PASS |
| Real-time SSE | PASS |
| TC-97 — Safari browser | Pending (requires device) |
| TC-99 — Physical stockroom audit | Pending (requires walk) |

---

## Known Notes

- The logo filename is spelled `STOCKSENCE LOGO.png` (typo from original asset) — cosmetic only, does not affect functionality.
- Password reset does not send a real email. In development mode the code is returned in the API response (`dev_code`) and logged to the server console. Wire a transactional email service (e.g. SendGrid, Nodemailer) in production.
- The `loginAttempts` lockout map uses a **15-minute rolling window** — counters auto-reset after the window expires. This prevents permanent lockout of test usernames across repeated test runs. The map is still in-memory (resets on server restart); persist it in a database or Redis for production.
- **TC-10/11/12 fix**: Previously, repeated test runs accumulated lockout counts for test usernames (`ADMIN`, `nobody`, `' OR 1=1 --`) until they returned HTTP 429 instead of the expected 401, causing test failures. Fixed by: (1) 15-min rolling window in `server.js`, (2) unique per-run usernames in TC-10 RSpec tests, (3) accepting both 401 and 429 as valid rejection responses in TC-11 and TC-12.
