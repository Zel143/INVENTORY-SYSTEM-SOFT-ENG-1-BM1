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
├── test-uat.js            # Automated UAT API test runner (36 tests)
├── Test Script_StockSense_Group_3_BM1 - UAT Cases.csv
└── README.md
```

---

## Prerequisites

- **Node.js** v18 or later
- **PostgreSQL** v14 or later (running on port 5432)
- A PostgreSQL database named `stocksense`

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

### 3. Create the PostgreSQL database

Open your PostgreSQL client (psql, pgAdmin, etc.) and run:

```sql
CREATE DATABASE stocksense;
```

### 4. Configure environment variables

Create a `.env` file inside the `backend files/` folder:

```env
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=stocksense
PG_USER=postgres
PG_PASSWORD=your_postgres_password

SESSION_SECRET=stocksense-secret-2026
```

> The `.env` file is already present if you cloned the full repo. Update `PG_PASSWORD` to match your local PostgreSQL setup.

### 5. Start the server

```bash
cd "backend files"
node server.js
```

The server will:
1. Connect to PostgreSQL
2. Automatically create all required tables and seed default users
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

Make sure the server is running first, then:

```bash
cd "e:\INVENTORY-SYSTEM-SOFT-ENG-1-BM1"
node test-uat.js
```

Expected output: **36 / 36 PASS**

The test suite covers authentication, inventory CRUD, dispatch/restock validation, history access control, pagination, and database connectivity.

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
| Backend API (36 automated tests) | PASS |
| Login / Logout / Session | PASS |
| Account lockout (TC-10) | PASS |
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
- The `loginAttempts` lockout map is in-memory — it resets on server restart. For production, persist it in the database or use Redis.
