# 🗄️ StockSense SQLite Setup Guide

## What Changed?

Your StockSense system now uses **SQLite database** with a **Node.js backend server** instead of Firebase. This gives you:

- ✅ **Local database** - No cloud dependencies
- ✅ **Full control** - Your data stays on your machine
- ✅ **REST API** - Standard HTTP endpoints
- ✅ **SQL queries** - Powerful data operations
- ✅ **Same features** - Role-based access, audit trail, real-time updates

---

## 📁 New Files Created

### Backend (Server-side)
- `database.sql` - Database schema with tables and triggers
- `server.js` - Express REST API server
- `init-database.js` - Database initialization script
- `package.json` - Node.js dependencies

### Frontend (Client-side)
- `app-sqlite.js` - Frontend logic with API calls
- `dashboard-sqlite.html` - Updated dashboard

### Preserved
- `app-firebase.js` - Firebase version (backup)
- `app.js` - localStorage version (backup)

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Install Node.js

**Check if already installed:**
```powershell
node --version
npm --version
```

**If not installed:**
1. Download from: https://nodejs.org/
2. Install LTS version (recommended)
3. Restart PowerShell

### Step 2: Install Dependencies

```powershell
# Navigate to project folder
cd E:\INVENTORY-SYSTEM-SOFT-ENG-1-BM1

# Install required packages
npm install
```

**Packages installed:**
- `express` - Web server framework
- `better-sqlite3` - SQLite database driver
- `cors` - Cross-origin resource sharing
- `express-session` - Session management
- `uuid` - Generate unique IDs

### Step 3: Initialize Database

```powershell
# Create and populate database
npm run init-db
```

**Expected output:**
```
📦 Creating new database...
📄 Reading schema file...
⚙️  Creating tables...

✅ Database initialized successfully!
📊 Tables created:
   • users               (2 rows)
   • inventory           (4 rows)
   • transactions        (0 rows)
   • allocation_logs     (0 rows)

🎉 Ready to start server! Run: npm start
```

### Step 4: Start Server

```powershell
# Start the backend server
npm start
```

**Expected output:**
```
╔════════════════════════════════════════════╗
║   🏭 StockSense Server Running             ║
║                                            ║
║   URL: http://localhost:3000               ║
║   Database: stocksense.db                  ║
║                                            ║
║   API Endpoints:                           ║
║   • POST /api/login                        ║
║   • GET  /api/inventory                    ║
║   • GET  /api/low-stock                    ║
║   • GET  /api/transactions (admin)         ║
║                                            ║
║   Press Ctrl+C to stop                     ║
╚════════════════════════════════════════════╝
```

### Step 5: Open Application

**Open in browser:**
```
http://localhost:3000/dashboard-sqlite.html
```

**Or use VS Code Live Server:**
1. Right-click `dashboard-sqlite.html`
2. Click "Open with Live Server"
3. Server will automatically connect to http://localhost:3000

**Login credentials:**
- **Admin**: `admin` / `admin`
- **Staff**: `staff` / `staff`

---

## 🏗️ Architecture Overview

### System Design

```
┌─────────────────────────────────────────────┐
│         Browser (Frontend)                  │
│  dashboard-sqlite.html + app-sqlite.js      │
└─────────────────┬───────────────────────────┘
                  │ HTTP Requests (REST API)
                  │ fetch('http://localhost:3000/api/...')
                  ▼
┌─────────────────────────────────────────────┐
│    Node.js Server (Backend)                 │
│    server.js (Express + Sessions)           │
│                                             │
│    API Routes:                              │
│    • POST /api/login                        │
│    • GET  /api/inventory                    │
│    • PUT  /api/inventory/:code              │
│    • GET  /api/transactions                 │
│    • POST /api/allocations                  │
└─────────────────┬───────────────────────────┘
                  │ SQL Queries
                  │ db.prepare('SELECT * FROM...')
                  ▼
┌─────────────────────────────────────────────┐
│      SQLite Database                        │
│      stocksense.db                          │
│                                             │
│      Tables:                                │
│      • users                                │
│      • inventory                            │
│      • transactions                         │
│      • allocation_logs                      │
└─────────────────────────────────────────────┘
```

### Database Schema

**users**
- Stores user accounts with roles (admin/staff)
- Used for authentication and authorization

**inventory**
- Stock levels, thresholds, vendor info
- Updated when stock is added/dispatched

**transactions** (Immutable)
- Audit trail of all stock movements
- **Cannot be edited or deleted** (enforced by triggers)

**allocation_logs**
- Material Allocation (MA) tracking
- Reserved stock for specific purposes

---

## 🔌 API Endpoints Reference

### Authentication

**POST /api/login**
```javascript
// Request
{
  "username": "admin",
  "password": "admin"
}

// Response
{
  "success": true,
  "user": {
    "id": "admin_001",
    "email": "admin@stocksense.com",
    "role": "admin",
    "display_name": "System Administrator"
  }
}
```

**POST /api/logout**
```javascript
// Response
{ "success": true }
```

**GET /api/session**
```javascript
// Response (if logged in)
{
  "authenticated": true,
  "user": { ... }
}
```

### Inventory

**GET /api/inventory**
```javascript
// Response
[
  {
    "code": "MCH-001",
    "description": "Forklift",
    "current_stock": 5,
    "min_threshold": 5,
    ...
  }
]
```

**GET /api/low-stock**
```javascript
// Response - Items below minimum threshold
[
  {
    "code": "MCH-002",
    "description": "Pallet Jack",
    "current_stock": 2,
    "min_threshold": 5,
    "shortage": 3
  }
]
```

**PUT /api/inventory/:code**
```javascript
// Request - Update stock
{
  "quantity_change": -3,
  "transaction_type": "dispatch",
  "destination": "Production Floor",
  "purpose": "Assembly Line #2"
}

// Response
{
  "success": true,
  "transactionId": "uuid-...",
  "new_stock": 2
}
```

### Transactions (Admin only)

**GET /api/transactions?limit=50**
```javascript
// Response
[
  {
    "id": "uuid-...",
    "item_name": "Forklift",
    "actor_name": "System Administrator",
    "quantity_change": -3,
    "previous_stock": 5,
    "new_stock": 2,
    "timestamp": "2026-02-12T10:30:00Z"
  }
]
```

---

## 🔒 Security Features

### Role-Based Access Control

**Admin Permissions:**
- ✅ View all inventory
- ✅ Add/dispatch stock
- ✅ Update thresholds
- ✅ View transaction history
- ✅ Manage allocation logs

**Staff Permissions:**
- ✅ View inventory
- ✅ Add/dispatch stock
- ❌ Cannot view transactions
- ❌ Cannot update thresholds
- ❌ Cannot manage allocations

### Immutable Audit Trail

Transactions table has **database-level triggers** that prevent:
- ❌ Editing existing transactions
- ❌ Deleting transaction records
- ❌ Bypassing audit trail

**Trigger example:**
```sql
CREATE TRIGGER prevent_transaction_delete
BEFORE DELETE ON transactions
BEGIN
    SELECT RAISE(FAIL, 'Transactions cannot be deleted');
END;
```

### Session Management

- Sessions stored server-side (not in localStorage)
- Expires after 24 hours
- HTTP-only cookies prevent XSS attacks

---

## 🧪 Testing Your Setup

### Test 1: Server is Running
```powershell
# In browser console (F12)
fetch('http://localhost:3000/api/session')
  .then(r => r.json())
  .then(console.log)
```

### Test 2: Database Queries
```powershell
# In PowerShell
cd E:\INVENTORY-SYSTEM-SOFT-ENG-1-BM1
node -e "const db = require('better-sqlite3')('stocksense.db'); console.log(db.prepare('SELECT * FROM inventory').all())"
```

### Test 3: API Authentication
```javascript
// In browser console
fetch('http://localhost:3000/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ username: 'admin', password: 'admin' })
})
.then(r => r.json())
.then(console.log)
```

---

## 🛠️ Troubleshooting

### Error: "Cannot find module 'express'"

**Problem:** Dependencies not installed

**Solution:**
```powershell
npm install
```

### Error: "Port 3000 is already in use"

**Problem:** Server already running or port taken

**Solutions:**
```powershell
# Option 1: Stop existing server
# Press Ctrl+C in PowerShell where server is running

# Option 2: Change port in server.js
# Edit line: const PORT = 3000;
# Change to: const PORT = 3001;
```

### Error: "CORS policy blocked"

**Problem:** Frontend and backend on different origins

**Solution:**
```javascript
// In server.js, CORS is already configured for:
// - http://127.0.0.1:5500 (VS Code Live Server)
// - http://localhost:3000 (Express static files)

// If using different port, update server.js line 30:
cors({
    origin: 'http://127.0.0.1:YOUR_PORT',
    credentials: true
})
```

### Database is empty after init-db

**Problem:** SQL file not found or syntax error

**Solution:**
```powershell
# Verify database.sql exists
Test-Path database.sql

# Re-run initialization
npm run init-db

# Check database file created
Test-Path stocksense.db
```

### Login not working

**Problem:** Session not persisting

**Checklist:**
1. ✅ Server is running (`npm start`)
2. ✅ Using correct credentials (`admin`/`admin`)
3. ✅ Browser allows cookies (check Settings)
4. ✅ Using dashboard-sqlite.html (not dashboard.html)

---

## 📊 Database Management

### View Database in VS Code

1. Install extension: **SQLite Viewer**
2. Open `stocksense.db`
3. Browse tables visually

### Query Database

```powershell
# Install SQLite CLI (optional)
winget install SQLite.SQLite

# Open database
sqlite3 stocksense.db

# Run queries
sqlite> SELECT * FROM inventory;
sqlite> SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 10;
sqlite> .exit
```

### Backup Database

```powershell
# Copy database file
Copy-Item stocksense.db stocksense-backup.db

# Or use SQLite backup
sqlite3 stocksense.db ".backup stocksense-backup.db"
```

### Reset Database

```powershell
# Delete existing database
Remove-Item stocksense.db

# Recreate from schema
npm run init-db
```

---

## 🚢 Deployment Options

### Option 1: Local Network Access

Share with team on same network:

1. Find your IP address:
```powershell
ipconfig | Select-String "IPv4"
```

2. Update CORS in server.js:
```javascript
cors({
    origin: '*', // Allow all origins (for testing only!)
    credentials: true
})
```

3. Team accesses: `http://YOUR_IP:3000/dashboard-sqlite.html`

### Option 2: Deploy to Cloud

**Services that support Node.js + SQLite:**
- Railway.app (easiest)
- Render.com
- Fly.io

**Note:** For production, migrate to PostgreSQL or MySQL for better cloud support.

---

## 🆚 SQLite vs Firebase Comparison

| Feature | SQLite | Firebase |
|---------|--------|----------|
| **Hosting** | Self-hosted | Cloud (Google) |
| **Cost** | Free | Free tier, then paid |
| **Real-time sync** | Polling (10s interval) | Native (instant) |
| **Offline mode** | N/A (server-side) | Built-in |
| **Scalability** | Limited (single file) | Unlimited |
| **Control** | Full control | Limited |
| **Setup time** | 5 minutes | 15 minutes |
| **Dependencies** | Node.js | Internet connection |

---

## 📚 Next Steps

### For Development

1. ✅ Test all features (add stock, dispatch, view history)
2. ✅ Create sample transactions
3. ✅ Test admin vs staff permissions
4. ✅ Verify triggers prevent transaction deletion

### For Demo (March 21)

1. ✅ Prepare sample data
2. ✅ Practice live demo workflow
3. ✅ Show SQL queries in database viewer
4. ✅ Explain three-table architecture
5. ✅ Demonstrate immutable audit trail

### For Production

1. ⚠️ Implement proper password hashing (bcrypt)
2. ⚠️ Use environment variables for secrets
3. ⚠️ Add input validation and sanitization
4. ⚠️ Set up HTTPS (SSL certificates)
5. ⚠️ Consider PostgreSQL for multi-user access

---

## 💡 Tips & Best Practices

### Development Workflow

```powershell
# Terminal 1: Run server
npm start

# Terminal 2: Watch for changes
npm run dev  # (uses nodemon for auto-restart)

# Terminal 3: Query database
sqlite3 stocksense.db
```

### Code Organization

```
Backend (server.js):
├── Authentication routes
├── Inventory routes
├── Transaction routes
└── Allocation routes

Frontend (app-sqlite.js):
├── API helper functions
├── Data loading functions
├── Rendering functions
└── Event handlers
```

### Performance Tips

1. **Use indexes** - Already created on foreign keys
2. **Limit query results** - Use `LIMIT` in SQL
3. **Cache on frontend** - Store inventory in `inventoryCache`
4. **Batch updates** - Group multiple changes in transactions

---

## 🎓 For Your Professor

### Key Points to Highlight

1. **Three-Layer Architecture**
   - Frontend (HTML/CSS/JS)
   - Backend (Node.js/Express)
   - Database (SQLite)

2. **REST API Design**
   - RESTful endpoints
   - HTTP methods (GET, POST, PUT)
   - JSON data format

3. **Database Triggers**
   - Enforce business rules at DB level
   - Prevent unauthorized data modification

4. **Session Management**
   - Server-side sessions (not localStorage)
   - Role-based authorization

5. **Transaction Integrity**
   - Immutable audit trail
   - Database-enforced constraints

---

## 📞 Support

**Questions?**
- Check troubleshooting section above
- Review server.js comments
- Inspect browser console (F12) for errors
- Check server logs in PowerShell

**Need to revert to Firebase?**
- Use dashboard.html (not dashboard-sqlite.html)
- All Firebase files are preserved

---

**Created:** February 12, 2026  
**Version:** SQLite 1.0  
**Authors:** StockSense Team
