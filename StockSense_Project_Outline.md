# StockSense — Project Outline
**Software Engineering 1 | Group 3 | BM1**

| Field | Details |
|---|---|
| Project Name | StockSense — Inventory Management System |
| Course | Software Engineering 1 |
| Section | BM1 |
| Group | Group 3 |
| Project Manager | Ranzel Virtucio |
| Business Analyst | Raphael Agapito |
| Repository | [Zel143/INVENTORY-SYSTEM-SOFT-ENG-1-BM1](https://github.com/Zel143/INVENTORY-SYSTEM-SOFT-ENG-1-BM1) |
| Document Version | 2.0 |
| Date | March 10, 2026 |

---

## 1. Project Description

StockSense is a web-based inventory management system developed as a Software Engineering 1 course project. It enables warehouses or supply teams to track physical stock levels, log all movements, and receive real-time alerts — replacing manual spreadsheets with a secure, role-aware, database-backed application.

The system supports two user roles (Admin and Staff), real-time browser updates via Server-Sent Events, a full immutable audit trail, and works with either a local SQLite file or a cloud PostgreSQL (Supabase) database with no code changes.

---

## 2. Objectives

1. Build a production-grade inventory management system using Node.js and PostgreSQL
2. Implement secure role-based access control (RBAC) with session authentication
3. Prevent common warehouse data problems: stockouts, overstocking, and untracked movements
4. Maintain a tamper-proof audit trail of all inventory transactions
5. Provide real-time updates to all connected users without requiring manual page refreshes
6. Demonstrate software engineering best practices: parameterised queries, input validation, concurrency handling, and automated UAT testing

---

## 3. Scope

### In Scope
- User registration, login, logout, and password reset
- Role-based access: Admin and Staff
- Full inventory CRUD (Create, Read, Update, Delete)
- Stock dispatch and restock transactions
- Stock allocation and deallocation (reserving units)
- Low-stock and overstock alerts
- Warranty tracking per item
- Real-time dashboard updates via SSE
- Paginated, searchable, sortable transaction history
- CSV export of transaction history
- Dark mode UI with localStorage persistence
- Automated UAT test suite (125 test cases)

### Out of Scope
- Email delivery of password reset codes (development mode returns codes in the API response)
- Safari / iOS cross-browser verification (marked pending — no Apple device available)
- Physical warehouse-to-digital audit (manual step, pending sign-off)
- Barcode / QR scanning
- Multi-warehouse / multi-location support

---

## 4. Team Roles and Responsibilities

| Role | Name | Responsibilities |
|---|---|---|
| Project Manager | Ranzel Virtucio | Sprint planning, UAT coordination, documentation, final testing |
| Business Analyst | Raphael Agapito | Requirements gathering, traceability matrix, user stories |

---

## 5. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js (v18+) | Server environment |
| Web Framework | Express 4 | HTTP routing and middleware |
| Database (cloud) | PostgreSQL via Supabase | Production data store |
| Database (local) | SQLite via `better-sqlite3` | Development / offline fallback |
| Authentication | express-session + bcryptjs | Secure session and password management |
| Frontend | HTML5 / CSS3 / Vanilla JS | No build tool required |
| Real-time | Server-Sent Events (SSE) | Live dashboard updates |
| Icons | Font Awesome 6 | UI icon library |
| Fonts | Google Fonts — Inter | Typography |
| Testing | RSpec (Ruby) + Node.js automated tests | UAT API test suites |
| Source Control | Git / GitHub | Version control |

---

## 6. Project Structure

```
INVENTORY-SYSTEM-SOFT-ENG-1-BM1/
│
├── backend files/
│   ├── server.js               # Express app — all 30+ API routes
│   ├── database.js             # DB pool, schema init, seed data
│   ├── package.json            # Node.js dependencies
│   └── .env                    # Environment variables (not committed)
│
├── frontend files/
│   ├── index.html              # Login page
│   ├── signup.html             # Registration page
│   ├── dashboard.html          # Main SPA dashboard
│   ├── app.js                  # Frontend logic (session, CRUD, SSE, export)
│   ├── style.css               # Login / signup page styles
│   └── dashboard.css           # Dashboard layout and component styles
│
├── spec/
│   ├── spec_helper.rb          # RSpec HTTP helper utilities
│   ├── stocksense_api_spec.rb  # RSpec UAT test suite
│   └── supabase/
│       └── schema.sql          # PostgreSQL schema for Supabase
│
├── .rspec                      # RSpec default options
├── .gitignore                  # Excludes node_modules, .env, PDFs
├── README.md                   # Setup and API reference guide
├── StockSense_Project_Outline.md           ← this file
├── StockSense_Specification_Document.md    # Full spec and UAT summary
├── Test Script_StockSense_Group_3_BM1 - UAT Cases.csv
└── Traceability Matrix_StockSense_Group_3_BM1.csv
```

---

## 7. System Architecture

```
Browser (HTML/CSS/JS)
        │
        │  HTTP / SSE
        ▼
Express Server (server.js)
        │  requireAuth / requireAdmin middleware
        │
        ├── Session Store (express-session, in-memory)
        │
        ├── Auth Routes     POST /api/login, /api/logout, /api/register
        │                   POST /api/forgot-password, /api/verify-reset-code
        │
        ├── Inventory Routes  GET/POST/PUT/DELETE /api/inventory/:code
        │                     POST /api/inventory/:code/allocate
        │                     POST /api/inventory/:code/deallocate
        │
        ├── Transaction Routes  GET /api/transactions
        │                       GET /api/transactions/item/:code
        │
        ├── Stats / Alerts    GET /api/stats, GET /api/low-stock
        │
        └── SSE              GET /api/events  (persistent connection)
                │
                ▼
        PostgreSQL (Supabase)   OR   SQLite (local file)
```

**Database Mode Selection** — automatic at startup:
- If `DATABASE_URL` is set in `.env` → uses **PostgreSQL / Supabase**
- If `DATABASE_URL` is absent → uses **SQLite** (local file, auto-created, no setup needed)

---

## 8. Key Features

### 8.1 Authentication and Security
| Feature | Implementation |
|---|---|
| Login / Logout | POST `/api/login` — bcrypt password compare, session cookie set |
| Email or Username Login | Single query: `WHERE username=$1 OR email=$1` |
| Account Lockout | 5 failures → 15-min lockout (rolling window); Admin can clear manually |
| Session Expiry | 2-hour `maxAge` on session cookie; `HttpOnly`, `SameSite=lax` |
| Password Reset | 6-digit code, 15-min TTL, single-use, anti-enumeration response |
| SQL Injection Prevention | All queries use parameterised placeholders (`$1`, `$2`) |
| Registration | Validates username format (regex), min 8-char password, unique username/email |

### 8.2 Inventory Management
| Feature | Implementation |
|---|---|
| Add Item | Admin-only `POST /api/inventory`; validates required fields, rejects duplicates and negatives |
| Edit Item | Admin-only `PUT /api/inventory/:code/details`; checks allocation limits |
| Delete Item | Admin-only `DELETE /api/inventory/:code`; audit record written before removal |
| Dispatch Stock | `PUT /api/inventory/:code` with negative `quantity_change`; overdraft protection |
| Restock Stock | `PUT /api/inventory/:code` with positive `quantity_change`; source field required |
| Allocate / Deallocate | Reserve units without changing physical count; prevents over-allocation |
| Concurrency Safety | `BEGIN → SELECT FOR UPDATE → UPDATE → INSERT → COMMIT` pattern |

### 8.3 Alerts and Visibility
| Feature | Implementation |
|---|---|
| Low-Stock Alert | Red badge when `current_stock <= min_threshold` |
| Overstock Alert | Yellow badge when `current_stock > max_ceiling` |
| Warranty Status | Green (Active), Red (Expired), or N/A badge per item |
| Dashboard Stats | Live counts: Total SKUs, Allocated, Low Stock, Overstocked |

### 8.4 Transaction History
| Feature | Implementation |
|---|---|
| Full Audit Trail | Every add/dispatch/restock/delete/allocate writes an immutable record |
| Admin-Only Access | `GET /api/transactions` requires Admin role; Staff get HTTP 403 |
| Per-Item History | `GET /api/transactions/item/:code` — Staff-accessible, 50 most recent |
| Pagination | 50 records per page; server returns `total`, `pages`, `page`, `limit` |
| Search and Sort | Client-side filter by actor, item code, item name, destination, purpose |
| CSV Export | Downloads current page as `.csv`; columns match on-screen table |
| DB-Level Immutability | PostgreSQL `BEFORE DELETE` trigger blocks direct deletion of audit records |

### 8.5 Real-Time Updates (SSE)
- All connected browsers maintain a persistent `GET /api/events` connection
- When any inventory item is added, updated, or deleted, the server calls `broadcast()` to push the event
- All connected clients call `loadInventory()` and `loadAlerts()` automatically — no page refresh needed

### 8.6 UI and UX
| Feature | Details |
|---|---|
| Single Page Application | Three tab views (Tracker, Log Stocks, Inventory History) switch in-place |
| Dark Mode | Toggle in header; saved to `localStorage`; persists across visits |
| Mobile Responsive | Hamburger menu, numeric keyboard on qty fields, viewport meta tag |
| Real-Time Search | Instant client-side filter across code, name, description, and vendor |
| Toast Notifications | Green (success) / Red (failure) — no blocking `alert()` dialogs |
| Double-Click Prevention | Submit button disabled on click; re-enabled in `finally` block |

---

## 9. API Summary

### Authentication
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/session` | Public | Check if session is active |
| POST | `/api/login` | Public | Login with username/email + password |
| POST | `/api/logout` | Any | Destroy session and clear cookie |
| POST | `/api/register` | Public | Register a new account |
| POST | `/api/forgot-password` | Public | Generate 6-digit reset code |
| POST | `/api/verify-reset-code` | Public | Verify reset code (single-use) |

### Inventory
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/inventory` | Any | List all items (supports `?search=`, `?vendor=`, `?low_stock=true`) |
| GET | `/api/inventory/:code` | Any | Get a single item |
| POST | `/api/inventory` | Admin | Create a new inventory item |
| PUT | `/api/inventory/:code` | Any | Dispatch or restock (signed `quantity_change`) |
| PUT | `/api/inventory/:code/details` | Admin | Edit item metadata and allocation |
| DELETE | `/api/inventory/:code` | Admin | Delete item (logs audit first) |
| POST | `/api/inventory/:code/allocate` | Any | Reserve stock units |
| POST | `/api/inventory/:code/deallocate` | Any | Release reserved stock units |

### Stats, Alerts, History
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/stats` | Any | Dashboard metric counts |
| GET | `/api/low-stock` | Any | Items at or below min threshold |
| GET | `/api/transactions` | Admin | Full paginated transaction history |
| GET | `/api/transactions/item/:code` | Any | Per-item history (last 50) |
| GET | `/api/events` | Any | SSE stream for real-time updates |

### Admin Management
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/admin/lockouts` | Admin | View all active lockout records |
| DELETE | `/api/admin/lockout/:username` | Admin | Clear a specific user's lockout |

---

## 10. Database Schema Overview

### `users`
Stores login credentials and roles.

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | Auto-increment |
| username | TEXT UNIQUE | Stored lowercase, 3–30 chars |
| email | TEXT UNIQUE | Optional; used for email-based login and password reset |
| full_name | TEXT | Display name |
| password_hash | TEXT | bcrypt hash — plaintext never stored |
| role | TEXT | `'admin'` or `'staff'` |
| created_at / updated_at | TIMESTAMPTZ | Auto-managed |

### `inventory`
Core table — one row per warehouse item (SKU).

| Column | Type | Notes |
|---|---|---|
| code | TEXT PK | Unique SKU (e.g. `SKU-101`) |
| name | TEXT | Item description |
| description | TEXT | Additional detail / spec |
| vendor | TEXT | Supplier name |
| delivery_date | DATE | Nullable |
| current_stock | INTEGER ≥ 0 | Physical units on hand |
| allocated_stock | INTEGER ≥ 0 | Reserved units (≤ current_stock) |
| max_ceiling | INTEGER | Overstock threshold (`0` = uncapped) |
| min_threshold | INTEGER | Low-stock alert level |
| warranty_start | DATE | Nullable |
| warranty_end | DATE | Nullable; drives Expired / Active badge |
| created_at | TIMESTAMPTZ | Auto-set |

### `transactions`
Immutable audit log — one row per movement.

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | Auto-increment |
| inventory_code | TEXT | FK → inventory.code |
| transaction_type | TEXT | `addition`, `dispatch`, `deletion`, `allocation`, `deallocation` |
| quantity_change | INTEGER | Signed: positive = added, negative = removed |
| actor_name | TEXT | From server-side session — cannot be spoofed |
| destination | TEXT | Required for dispatch |
| purpose | TEXT | Optional work-order reference |
| timestamp | TIMESTAMPTZ | Set by DB at insert time |

### `login_attempts`
Tracks consecutive failed logins per username for lockout enforcement.

| Column | Type | Notes |
|---|---|---|
| username | TEXT PK | |
| attempts | INTEGER | Rolling count |
| first_attempt | TIMESTAMPTZ | Start of current 15-min window |

---

## 11. Testing Strategy

### 11.1 UAT Test Suite
- **125 manual test cases** documented in `Test Script_StockSense_Group_3_BM1 - UAT Cases.csv`
- Covers: login, lockout, session, RBAC, inventory CRUD, dispatch, restock, allocation, alerts, history, pagination, export, real-time, registration, password reset, dark mode, cross-browser, and DB connectivity
- **123 / 125 passed** as of March 3, 2026

### 11.2 Automated RSpec Test Suite
- Located in `spec/stocksense_api_spec.rb`
- Uses `Net::HTTP` to make live requests against the running server
- Covers all critical API endpoints with documented expected status codes and response shapes
- Run with: `rspec spec/stocksense_api_spec.rb --format documentation`

### 11.3 Pending Manual Tests
| TC # | Description | Blocker |
|---|---|---|
| TC-97 | Safari / iOS cross-browser | No Apple device available |
| TC-99 | Physical warehouse audit | Requires manual count verification |

### 11.4 Security Testing (Included in UAT)
| TC # | Attack | Result |
|---|---|---|
| TC-12 | SQL Injection | Blocked — parameterised queries treat payload as literal string |
| TC-13 | Special Character Input | Handled safely |
| TC-10 | Brute Force (5 failures) | Lockout triggered correctly |
| TC-11 | Case Sensitivity Bypass | Denied — exact-case matching enforced |
| TC-111 | Email Enumeration | Mitigated — vague identical response for registered and unregistered emails |

---

## 12. Project Timeline

| Phase | Activities | Period |
|---|---|---|
| Planning | Requirements gathering, system design, traceability matrix, DB schema | January 2026 |
| Development — Sprint 1 | Login/logout, session, RBAC, basic inventory CRUD | February 1–14, 2026 |
| Development — Sprint 2 | Dispatch, restock, allocation, alerts, SSE, history, pagination | February 15–28, 2026 |
| Development — Sprint 3 | Registration, password reset, dark mode, CSV export, bug fixes | March 1–9, 2026 |
| UAT | Execute 125 test cases, log results, fix defects | February 14 – March 10, 2026 |
| Final Sign-Off | Resolve remaining 2 pending items, production deployment review | March 10, 2026 |

---

## 13. Setup and Installation

### Prerequisites
- **Node.js** v18 or later
- (Optional) A free **Supabase** project for cloud PostgreSQL

### Step 1 — Clone the Repository
```bash
git clone https://github.com/Zel143/INVENTORY-SYSTEM-SOFT-ENG-1-BM1.git
cd INVENTORY-SYSTEM-SOFT-ENG-1-BM1
```

### Step 2 — Install Dependencies
```bash
cd "backend files"
npm install
```

### Step 3 — Configure Environment
Create `backend files/.env`:
```env
# For PostgreSQL / Supabase:
DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>.pooler.supabase.com:5432/postgres
SESSION_SECRET=your-random-secret-here
PORT=3000

# For SQLite (local, no DB setup needed): leave DATABASE_URL commented out
```

### Step 4 — (PostgreSQL only) Run Schema
In the Supabase SQL Editor, paste and run the full contents of `spec/supabase/schema.sql`.

### Step 5 — Start the Server
```bash
node server.js
```
Server starts on **http://localhost:3000** and seeds default users on first run.

### Default Credentials
| Username | Password | Role |
|---|---|---|
| `admin` | `admin` | Administrator |
| `staff` | `staff` | Staff |

> Change these credentials before any production deployment.

---

## 14. Known Issues and Risks

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | Logo filename misspelled (`STOCKSENCE` vs `STOCKSENSE`) | Low — cosmetic only | Accepted; no functionality impact |
| 2 | Safari / iOS session cookie behaviour unverified | Medium | Pending device test |
| 3 | Password reset codes stored in-memory (lost on server restart) | Medium | Acceptable for course project scope |
| 4 | No email delivery for reset codes (dev_code returned in API) | Medium | Acceptable for course project scope |
| 5 | Physical warehouse audit not yet performed | High — required for production sign-off | Scheduled |

---

## 15. References and Documents

| Document | File |
|---|---|
| UAT Test Script (125 cases) | `Test Script_StockSense_Group_3_BM1 - UAT Cases.csv` |
| Requirements Traceability Matrix | `Traceability Matrix_StockSense_Group_3_BM1.csv` |
| System Specification & UAT Summary | `StockSense_Specification_Document.md` |
| Database Schema (PostgreSQL) | `spec/supabase/schema.sql` |
| API Reference and Setup Guide | `README.md` |
| RSpec UAT Suite | `spec/stocksense_api_spec.rb` |

---

*StockSense — Group 3, BM1 | Software Engineering 1 | March 10, 2026*
