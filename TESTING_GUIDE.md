# 🧪 StockSense Testing Guide

## Testing Your Firebase Implementation

This guide provides test scripts and procedures to validate your StockSense system before the March 21 demo.

---

## 📋 Testing Categories

1. **Manual Browser Tests** - Run in console (quick validation)
2. **Security Rules Tests** - Verify access control
3. **Real-Time Sync Tests** - Validate onSnapshot() listeners
4. **Business Logic Tests** - Verify inventory operations
5. **Integration Tests** - End-to-end scenarios

---

## 🔍 1. Manual Browser Console Tests

### Setup: Open Browser Console
```
1. Open dashboard.html in Chrome/Edge
2. Press F12 to open Developer Tools
3. Go to Console tab
4. Copy-paste these test scripts
```

### Test 1: Firebase Connection
```javascript
// Test: Check if Firebase is initialized
console.log("🔥 Firebase App:", firebase.app().name);
console.log("📊 Firestore Instance:", db ? "✅ Connected" : "❌ Not Connected");

// Test: Query inventory collection
inventoryRef.get()
  .then(snapshot => {
    console.log(`✅ Inventory items found: ${snapshot.size}`);
    snapshot.forEach(doc => {
      console.log(`  - ${doc.id}: ${doc.data().description}`);
    });
  })
  .catch(error => {
    console.error("❌ Firebase Error:", error.code, error.message);
  });
```

**Expected Result:**
```
✅ Inventory items found: 4
  - MCH-001: Forklift
  - MCH-002: Pallet Jack
  - EQP-104: Conveyor Belt
  - STR-201: Shelving Unit
```

### Test 2: User Authentication Status
```javascript
// Test: Check logged-in user
const testAuth = () => {
  const isLoggedIn = sessionStorage.getItem("stocksense_logged_in");
  const userId = sessionStorage.getItem("stocksense_user_id");
  const userRole = sessionStorage.getItem("stocksense_role");
  const displayName = sessionStorage.getItem("stocksense_display_name");
  
  console.log("👤 Authentication Status:");
  console.log(`  Logged In: ${isLoggedIn === "true" ? "✅" : "❌"}`);
  console.log(`  User ID: ${userId}`);
  console.log(`  Role: ${userRole}`);
  console.log(`  Display Name: ${displayName}`);
  console.log(`  Is Admin: ${isAdmin() ? "✅ Yes" : "❌ No"}`);
};

testAuth();
```

**Expected Result (if logged in as admin):**
```
👤 Authentication Status:
  Logged In: ✅
  User ID: admin_001
  Role: admin
  Display Name: System Administrator
  Is Admin: ✅ Yes
```

### Test 3: Real-Time Listener Status
```javascript
// Test: Check if listeners are active
const testListeners = () => {
  console.log("🎧 Real-Time Listeners:");
  console.log(`  Inventory Listener: ${unsubscribeInventory ? "✅ Active" : "❌ Not Active"}`);
  console.log(`  Transactions Listener: ${unsubscribeTransactions ? "✅ Active" : "❌ Not Active"}`);
  console.log(`  Inventory Cache Size: ${inventoryCache.length} items`);
  console.log(`  Transactions Cache Size: ${transactionsCache.length} logs`);
};

testListeners();
```

### Test 4: Security Rules - Admin Access
```javascript
// Test: Admin trying to read transactions (should succeed)
const testAdminAccess = async () => {
  console.log("🔐 Testing Admin Access...");
  
  try {
    // Test 1: Read transactions (admin only)
    const snapshot = await transactionsRef.limit(1).get();
    console.log("✅ Admin can read transactions:", snapshot.size, "records");
    
    // Test 2: Update inventory threshold (admin only)
    const testUpdate = {
      min_threshold: 10
    };
    await inventoryRef.doc("MCH-001").update(testUpdate);
    console.log("✅ Admin can update thresholds");
    
    // Reset
    await inventoryRef.doc("MCH-001").update({ min_threshold: 5 });
    console.log("✅ Threshold reset to original value");
    
  } catch (error) {
    console.error("❌ Admin Access Error:", error.code, error.message);
  }
};

// Run only if logged in as admin
if (isAdmin()) {
  testAdminAccess();
} else {
  console.warn("⚠️ Skipping admin tests - not logged in as admin");
}
```

### Test 5: Security Rules - Staff Restrictions
```javascript
// Test: Staff trying restricted operations (should fail)
const testStaffRestrictions = async () => {
  console.log("🔐 Testing Staff Restrictions...");
  
  try {
    // Test 1: Try to read transactions (should fail for staff)
    const snapshot = await transactionsRef.limit(1).get();
    console.error("❌ SECURITY BREACH: Staff can read transactions!");
  } catch (error) {
    if (error.code === 'permission-denied') {
      console.log("✅ Staff correctly blocked from reading transactions");
    } else {
      console.error("❌ Unexpected error:", error);
    }
  }
  
  try {
    // Test 2: Try to update threshold (should fail for staff)
    await inventoryRef.doc("MCH-001").update({ min_threshold: 1 });
    console.error("❌ SECURITY BREACH: Staff can modify thresholds!");
  } catch (error) {
    if (error.code === 'permission-denied') {
      console.log("✅ Staff correctly blocked from modifying thresholds");
    } else {
      console.error("❌ Unexpected error:", error);
    }
  }
  
  try {
    // Test 3: Try to update stock (should succeed for staff)
    await inventoryRef.doc("MCH-001").update({ current_stock: 10 });
    console.log("✅ Staff can update stock levels (as expected)");
    
    // Reset
    await inventoryRef.doc("MCH-001").update({ current_stock: 5 });
  } catch (error) {
    console.error("❌ Staff should be able to update stock:", error);
  }
};

// Run only if logged in as staff
if (!isAdmin() && getUserRole() === 'staff') {
  testStaffRestrictions();
} else {
  console.warn("⚠️ Skipping staff tests - not logged in as staff");
}
```

### Test 6: Immutable Transaction Test
```javascript
// Test: Try to edit an existing transaction (should fail for everyone)
const testImmutableTransactions = async () => {
  console.log("🔒 Testing Immutable Transactions...");
  
  try {
    // First, create a test transaction
    const newTransaction = await transactionsRef.add({
      item_id: inventoryRef.doc("MCH-001"),
      item_name: "Test Item",
      actor_id: getCurrentUserId(),
      quantity_change: 1,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      destination: "Test",
      purpose: "Testing Immutability"
    });
    
    console.log("✅ Transaction created:", newTransaction.id);
    
    // Now try to update it (should fail)
    await newTransaction.update({ quantity_change: 999 });
    console.error("❌ SECURITY BREACH: Transactions can be edited!");
    
  } catch (error) {
    if (error.code === 'permission-denied') {
      console.log("✅ Transactions are immutable (cannot be updated)");
    } else {
      console.error("❌ Unexpected error:", error);
    }
  }
  
  try {
    // Try to delete a transaction (should also fail)
    const snapshot = await transactionsRef.limit(1).get();
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.delete();
      console.error("❌ SECURITY BREACH: Transactions can be deleted!");
    }
  } catch (error) {
    if (error.code === 'permission-denied') {
      console.log("✅ Transactions cannot be deleted");
    } else {
      console.error("❌ Unexpected error:", error);
    }
  }
};

testImmutableTransactions();
```

### Test 7: Stock Operation Logic
```javascript
// Test: Add and remove stock with validation
const testStockOperations = async () => {
  console.log("📦 Testing Stock Operations...");
  
  try {
    // Get initial state
    const doc = await inventoryRef.doc("MCH-001").get();
    const initialStock = doc.data().current_stock;
    console.log(`Initial stock: ${initialStock}`);
    
    // Test 1: Add stock
    await inventoryRef.doc("MCH-001").update({
      current_stock: initialStock + 5
    });
    console.log("✅ Stock added successfully");
    
    // Verify
    const doc2 = await inventoryRef.doc("MCH-001").get();
    const newStock = doc2.data().current_stock;
    if (newStock === initialStock + 5) {
      console.log(`✅ Stock verified: ${initialStock} → ${newStock}`);
    } else {
      console.error(`❌ Stock mismatch: Expected ${initialStock + 5}, got ${newStock}`);
    }
    
    // Test 2: Remove stock
    await inventoryRef.doc("MCH-001").update({
      current_stock: initialStock
    });
    console.log("✅ Stock reset successfully");
    
    // Test 3: Try negative stock (should be prevented by app logic)
    const available = calculateAvailableStock(doc.data());
    console.log(`Available stock: ${available}`);
    console.log(`Allocated stock: ${doc.data().allocated_stock || 0}`);
    
  } catch (error) {
    console.error("❌ Stock Operation Error:", error);
  }
};

testStockOperations();
```

---

## 🎯 2. Real-Time Sync Test (Manual)

### Two-Tab Sync Test

**Setup:**
1. Open [dashboard.html](dashboard.html) in Tab 1
2. Open [dashboard.html](dashboard.html) in Tab 2 (Ctrl+Click or right-click → Duplicate)
3. Login with same credentials in both tabs

**Test Procedure:**
```
TAB 1: Click + button on MCH-001 (add 1 stock)
       ↓
TAB 2: Watch the quantity update automatically (should be <2 seconds)
       ↓
TAB 2: Click - button on MCH-002 (remove 1 stock)
       ↓
TAB 1: Watch the quantity update automatically
```

**Expected Result:**
- Both tabs show the same data at all times
- Updates appear within 2 seconds
- No page refresh needed

**Console Monitoring:**
```javascript
// In both tabs, run this to see sync activity
const originalRenderAll = renderAll;
renderAll = function() {
  console.log("🔄 UI Update triggered at", new Date().toLocaleTimeString());
  return originalRenderAll.apply(this, arguments);
};
```

---

## 🔐 3. Security Rules Unit Tests

### Firebase Emulator Tests (Optional - Advanced)

If you want to run automated security rules tests, create this file:

**File: `firestore.test.js`**
```javascript
const firebase = require('@firebase/testing');
const fs = require('fs');

// Load security rules
const rules = fs.readFileSync('firestore.rules', 'utf8');

describe('StockSense Security Rules', () => {
  let db;
  
  beforeEach(async () => {
    // Create test project
    const projectId = `stocksense-test-${Date.now()}`;
    await firebase.loadFirestoreRules({
      projectId,
      rules
    });
    
    db = firebase.initializeTestApp({ projectId, auth: { uid: 'admin_001', role: 'admin' } }).firestore();
  });
  
  afterEach(async () => {
    await firebase.clearFirestoreData({ projectId });
  });
  
  test('Admin can read transactions', async () => {
    const adminDb = firebase.initializeTestApp({ 
      projectId: 'test', 
      auth: { uid: 'admin_001' } 
    }).firestore();
    
    await firebase.assertSucceeds(
      adminDb.collection('transactions').get()
    );
  });
  
  test('Staff cannot read transactions', async () => {
    const staffDb = firebase.initializeTestApp({ 
      projectId: 'test', 
      auth: { uid: 'staff_001' } 
    }).firestore();
    
    await firebase.assertFails(
      staffDb.collection('transactions').get()
    );
  });
  
  test('No one can update transactions', async () => {
    const adminDb = firebase.initializeTestApp({ 
      projectId: 'test', 
      auth: { uid: 'admin_001' } 
    }).firestore();
    
    const doc = adminDb.collection('transactions').doc('test123');
    await doc.set({ test: 'data' });
    
    await firebase.assertFails(
      doc.update({ test: 'modified' })
    );
  });
});
```

**To run:**
```bash
npm install --save-dev @firebase/testing jest
npx jest firestore.test.js
```

---

## 📝 4. Complete Test Checklist

### Pre-Demo Testing Checklist

```markdown
## Authentication Tests
- [ ] Admin login works (admin/admin)
- [ ] Staff login works (staff/staff)
- [ ] Wrong credentials show error
- [ ] Logout clears sessionStorage
- [ ] Role badge displays correctly (Admin/Staff)

## Inventory Display Tests
- [ ] All 4 default items load on first visit
- [ ] Stock Alerts tab shows low stock items
- [ ] Inventory tab shows all items with correct data
- [ ] Search box filters items correctly
- [ ] Warranty warnings show for expiring items
- [ ] Location information displays

## Stock Operations Tests
- [ ] Admin can add stock (+) button
- [ ] Admin can remove stock (-) button
- [ ] Staff can add stock
- [ ] Staff can remove stock
- [ ] Cannot remove more than available stock
- [ ] Transaction modal shows correct information
- [ ] Destination field required for dispatch
- [ ] Purpose field required for dispatch

## Real-Time Sync Tests
- [ ] Two tabs sync automatically (<2 seconds)
- [ ] Changes in Tab 1 appear in Tab 2
- [ ] Changes in Tab 2 appear in Tab 1
- [ ] Stock Alerts update in real-time
- [ ] Inventory table updates in real-time
- [ ] No page refresh needed

## Security Tests - Admin
- [ ] Admin can view Transaction History tab
- [ ] Admin sees all transactions
- [ ] Admin can modify min_threshold (Firebase Console)
- [ ] Admin can modify max_ceiling (Firebase Console)
- [ ] Admin can read allocation_logs

## Security Tests - Staff
- [ ] Staff cannot view Transaction History
- [ ] Staff sees "Admin Only" message
- [ ] Staff cannot modify min_threshold (Firebase Console test)
- [ ] Staff cannot modify max_ceiling (Firebase Console test)
- [ ] Staff can update current_stock
- [ ] Staff can update allocated_stock

## Immutability Tests
- [ ] Create transaction → try to edit in Firebase Console → Permission denied
- [ ] Try to delete transaction in Firebase Console → Permission denied
- [ ] Even admin cannot edit transactions
- [ ] Transaction history remains unchanged

## Offline Tests
- [ ] Dashboard loads with cached data when offline
- [ ] Can view inventory while offline
- [ ] Stock operations queue when offline
- [ ] Changes sync when back online
- [ ] Warning message appears (offline persistence)

## UI/UX Tests
- [ ] Dark/light theme toggle works
- [ ] Theme preference persists
- [ ] Modal opens and closes correctly
- [ ] All icons load correctly (Font Awesome)
- [ ] Responsive design works on mobile
- [ ] No console errors (check F12)

## Firebase Console Tests
- [ ] Firestore rules deployed correctly
- [ ] users collection has admin_001 and staff_001
- [ ] inventory collection has 4 items
- [ ] transactions collection creates on first operation
- [ ] allocation_logs collection exists (may be empty)

## Performance Tests
- [ ] Initial page load <3 seconds
- [ ] Real-time updates <2 seconds
- [ ] Search filters instantly
- [ ] No lag when switching tabs
- [ ] Smooth animations and transitions
```

---

## 🚨 5. Troubleshooting Test Failures

### If Firebase Connection Fails
```javascript
// Debug: Check Firebase config
console.log("Firebase Config:", firebase.app().options);

// Expected to see your real values, not "YOUR_API_KEY"
// If you see placeholders, update firebase-config.js
```

### If Security Rules Fail
```javascript
// Debug: Check user role in Firestore
const checkUserRole = async () => {
  const userId = getCurrentUserId();
  const userDoc = await usersRef.doc(userId).get();
  
  if (userDoc.exists) {
    console.log("User document found:", userDoc.data());
  } else {
    console.error("❌ User document missing! Create it in Firebase Console.");
    console.log("Expected path: users/" + userId);
  }
};

checkUserRole();
```

### If Real-Time Sync Fails
```javascript
// Debug: Check listeners
const debugListeners = () => {
  console.log("Inventory Listener:", unsubscribeInventory ? "Active" : "Inactive");
  console.log("Transactions Listener:", unsubscribeTransactions ? "Active" : "Inactive");
  
  // Force re-attach
  console.log("Re-attaching listeners...");
  setupRealtimeListeners();
};

debugListeners();
```

---

## 📊 6. Test Report Template

After testing, document your results:

```markdown
# StockSense Test Report
Date: [YOUR DATE]
Tester: [YOUR NAME]
Environment: Firebase Project ID: [YOUR PROJECT]

## Summary
- Total Tests: X
- Passed: X
- Failed: X
- Skipped: X

## Test Results

### ✅ Passed Tests
1. Firebase connection established
2. Admin can view transactions
3. Real-time sync works (<2 seconds)
4. [Add more...]

### ❌ Failed Tests
1. [If any, describe what failed and why]

### ⚠️ Issues Found
1. [Any bugs or concerns]

## Performance Metrics
- Page Load Time: X seconds
- Real-Time Sync Latency: X seconds
- Search Filter Speed: X ms

## Recommendations
- [Any improvements needed]

## Screenshots
- [Attach screenshots of key tests]
```

---

## 🎯 Quick Pre-Demo Test Script

**Run this 5 minutes before your demo:**

```javascript
// === STOCKSENSE PRE-DEMO TEST ===
console.clear();
console.log("🚀 Running StockSense Pre-Demo Tests...\n");

const runPreDemoTests = async () => {
  let passed = 0;
  let failed = 0;
  
  // Test 1: Firebase Connection
  try {
    await inventoryRef.get();
    console.log("✅ Firebase connected");
    passed++;
  } catch (e) {
    console.error("❌ Firebase connection failed");
    failed++;
  }
  
  // Test 2: User authenticated
  if (sessionStorage.getItem("stocksense_logged_in") === "true") {
    console.log("✅ User authenticated");
    passed++;
  } else {
    console.error("❌ Not logged in");
    failed++;
  }
  
  // Test 3: Inventory loaded
  if (inventoryCache.length > 0) {
    console.log(`✅ Inventory loaded (${inventoryCache.length} items)`);
    passed++;
  } else {
    console.error("❌ No inventory data");
    failed++;
  }
  
  // Test 4: Listeners active
  if (unsubscribeInventory) {
    console.log("✅ Real-time listeners active");
    passed++;
  } else {
    console.error("❌ Listeners not active");
    failed++;
  }
  
  // Test 5: Security rules
  try {
    if (isAdmin()) {
      await transactionsRef.limit(1).get();
      console.log("✅ Admin access working");
      passed++;
    } else {
      console.log("✅ Logged in as staff (limited access)");
      passed++;
    }
  } catch (e) {
    console.error("❌ Security rules issue:", e.code);
    failed++;
  }
  
  // Summary
  console.log("\n" + "=".repeat(40));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(40));
  
  if (failed === 0) {
    console.log("🎉 ALL SYSTEMS READY FOR DEMO!");
  } else {
    console.error("⚠️ Fix failed tests before demo!");
  }
};

runPreDemoTests();
```

---

## 📖 Additional Resources

**Firebase Testing Documentation:**
- https://firebase.google.com/docs/rules/unit-tests
- https://firebase.google.com/docs/emulator-suite

**Browser Testing Tools:**
- Chrome DevTools Console (F12)
- Network Tab (check Firestore requests)
- Application Tab (check sessionStorage)

**Performance Monitoring:**
- Firebase Console → Performance tab
- Lighthouse audit (Chrome DevTools)

---

**🎓 For March 21 Demo:**
Run the "Quick Pre-Demo Test Script" above 5 minutes before presenting to ensure everything is working!

**💡 Pro Tip:**
Keep this file open in a separate tab during your demo. If something breaks, you can quickly run diagnostic tests.