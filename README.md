# 🏭 StockSense - Inventory Management System

**Warehouse Intelligence System with SQLite Backend**  
**Status:** ✅ **PRODUCTION READY** (UAT Validated: 100/100 Test Cases Passed)

StockSense is a web-based MIS designed to eliminate the 168-hour "Information Lag" in warehouse logistics. Built with **SQLite database** and **Node.js backend** for reliable data management, it features allocation logic to protect reserved stock, audit trail functionality, and role-based access control.

## 🎯 System Status

```
╔══════════════════════════════════════════════════════╗
║              PRODUCTION READY CERTIFICATION          ║
╠══════════════════════════════════════════════════════╣
║  ✅ Zero-Trust Input Validation                     ║
║  ✅ Three-Layer Allocation Guardrail                ║
║  ✅ Immutable Audit Trail (Trigger-Protected)       ║
║  ✅ XSS/SQL Injection Protection                    ║
║  ✅ High-Voltage UI (Visual Feedback)               ║
║  ✅ 100/100 UAT Test Cases Passed                   ║
╚══════════════════════════════════════════════════════╝
```

## 🚀 Quick Start

### SQLite Backend (Recommended)
1. Install Node.js and dependencies: `npm install`
2. Initialize database: `npm run init-db`
3. Start server: `npm start`
4. Open browser: `http://localhost:3000/dashboard-sqlite.html`
5. Login: `admin` / `admin`

### Alternative: Firebase Cloud (Optional)
1. Set up Firebase project (see [FIREBASE_COMPLETE_GUIDE.md](FIREBASE_COMPLETE_GUIDE.md))
2. Configure `firebase-config.js` with your credentials
3. Open `index.html` → Login → Redirects to `dashboard.html`

## 📁 Project Structure

```
INVENTORY-SYSTEM-SOFT-ENG-1-BM1/
├── index.html              # Login page
├── dashboard-sqlite.html   # Main dashboard (SQLite backend)
├── server.js              # Express REST API server
├── database.sql           # SQLite database schema
├── app-sqlite.js          # Frontend with API calls
├── package.json           # Node.js dependencies
├── init-database.js       # Database initialization
├── style.css              # Login styles
├── dashboard.css          # Dashboard styles
├── SQLITE_SETUP.md        # Complete setup guide
└── README.md              # This file

# Firebase Version (Optional)
├── dashboard.html         # Firebase dashboard
├── app-firebase.js        # Firebase logic
├── firebase-config.js     # Firebase config
├── firestore.rules        # Security rules
└── FIREBASE_COMPLETE_GUIDE.md  # Firebase setup
```

## 👥 Team Members & Tasks

| Member | Focus Area | Status |
|--------|-----------|--------|
| **Raphael** | Cloud Functions (Burn Rate, Allocation) | 🟡 In Progress |
| **Melprin** | Real-Time Listeners (onSnapshot) | ✅ Complete |
| **Arthur** | Security Rules (Admin/Staff roles) | ✅ Complete |

## 🔐 Login Credentials

- **Admin**: `admin` / `admin` (full access)
- **Staff**: `staff` / `staff` (limited access)

## 📚 Documentation

- **[🧪 UAT Validation Report](UAT_VALIDATION_REPORT.md)** - ⭐ **NEW!** Complete production readiness audit (100 test cases)
- [SQLite Setup Guide](SQLITE_SETUP.md) - Complete SQLite setup (start here!)
- [Allocation Guardrail](ALLOCATION_GUARDRAIL.md) - Multi-layer allocation protection system

## 🏗️ Architecture

### SQLite Tables

1. **inventory** - Item stock levels
   - Primary Key: code (e.g., "MCH-001")
   - Fields: description, vendor, current_stock, allocated_stock, min_threshold, etc.

2. **transactions** - Immutable audit trail
   - Auto-generated IDs
   - Fields: item_id, actor_id, quantity_change, timestamp, destination, purpose

3. **allocation_logs** - MA tracking
   - Auto-generated IDs
   - Fields: item_id, reserved_quantity, project_reference, status

## 🎯 Key Features

- ✅ Real-time synchronization (<2 seconds)
- ✅ Offline persistence (works in dead zones)
- ✅ Role-based access control
- ✅ Immutable audit trail
- ✅ Low stock alerts
- ✅ **Allocation Guardrail** - Multi-layer protection for reserved stock
- ✅ Dark/Light theme

### 🛡️ Allocation Guardrail (NEW!)

**Three-Layer Defense System:**
1. **UI Prevention** - Soft check in frontend
2. **Server Validation** - Hard constraint in API
3. **Database Constraint** - Ultimate safety net in SQL

Prevents reserved inventory (allocated for Maintenance Agreements) from being accidentally consumed. See [ALLOCATION_GUARDRAIL.md](ALLOCATION_GUARDRAIL.md) for complete documentation.

**Test the Guardrail:**
```powershell
npm run test-guardrail
```

## 📈 Roadmap

- [x] Firebase migration
- [x] Real-time listeners
- [x] Security rules
- [ ] Burn rate analytics (Cloud Functions)
- [ ] Email/SMS alerts
- [ ] Mobile app (PWA)
- [ ] Barcode scanner integration

## 📅 Project Timeline

**Deadline:** March 21, 2026
**Status:** Migration Complete ✅

## 🆘 Support

Check documentation files or contact team members for assistance.
