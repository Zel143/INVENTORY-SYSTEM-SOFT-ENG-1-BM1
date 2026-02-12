# 🏭 StockSense - Inventory Management System

**Cloud-Native Warehouse Intelligence System**

StockSense is a web-based MIS designed to eliminate the 168-hour "Information Lag" in warehouse logistics. Migrated from SQLite to **Firebase Cloud Firestore** for real-time synchronization, it features allocation logic to protect reserved stock, and predictive "Burn Rate" analytics to mitigate stockout risks and optimize capital efficiency.

## 🚀 Quick Start

### Local Development (localStorage)
1. Open `index.html` in browser
2. Login: `admin` / `admin`
3. Data stored locally

### Firebase Cloud (Real-time Sync)
1. Set up Firebase project (see [FIREBASE_SETUP.md](FIREBASE_SETUP.md))
2. Configure `firebase-config.js` with your credentials
3. Open `index.html` → Redirects to `dashboard.html`
4. Real-time sync across all devices! ✨

## 📁 Project Structure

```
INVENTORY-SYSTEM-SOFT-ENG-1-BM1/
├── index.html              # Login page
├── dashboard.html          # Main dashboard (Firebase-enabled)
├── style.css              # Login styles
├── dashboard.css          # Dashboard styles
├── app.js                 # localStorage version (legacy)
├── firebase-config.js     # Firebase initialization
├── firestore.rules        # Security rules
├── functions-example.js   # Cloud Functions (Raphael's work)
├── FIREBASE_SETUP.md      # Complete setup guide
├── MIGRATION_OPTIONS.md   # Migration strategies
└── README.md             # This file
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

- [Firebase Setup Guide](FIREBASE_SETUP.md) - Complete Firebase configuration
- [Migration Options](MIGRATION_OPTIONS.md) - Choose your migration path
- [Security Rules](firestore.rules) - Firestore access control

## 🏗️ Architecture

### Firestore Collections

1. **inventory** - Item stock levels
   - Document ID: Item code (e.g., "MCH-001")
   - Fields: description, vendor, current_stock, allocated_stock, min_threshold, etc.

2. **transactions** - Audit trail
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
- ✅ Allocation protection
- ✅ Dark/Light theme

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
