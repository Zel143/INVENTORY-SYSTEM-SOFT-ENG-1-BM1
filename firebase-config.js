// ======================================
// FIREBASE CONFIGURATION
// ======================================
// Instructions:
// 1. Go to Firebase Console: https://console.firebase.google.com
// 2. Create a new project or select existing
// 3. Go to Project Settings > General > Your apps
// 4. Click "Add app" and select Web (</> icon)
// 5. Copy the firebaseConfig object and replace the placeholder below

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

// Enable offline persistence (critical for warehouse dead zones)
db.enablePersistence()
    .catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
        } else if (err.code === 'unimplemented') {
            console.warn('The current browser does not support offline persistence');
        }
    });

// ======================================
// FIRESTORE COLLECTIONS REFERENCES
// ======================================
const inventoryRef = db.collection('inventory');
const transactionsRef = db.collection('transactions');
const allocationLogsRef = db.collection('allocation_logs');
const usersRef = db.collection('users');

// ======================================
// USER ROLE MANAGEMENT
// ======================================
// These functions manage user roles for the security rules
// In production, this should be replaced with Firebase Authentication

// Get current user's role from sessionStorage (temporary solution)
function getUserRole() {
    return sessionStorage.getItem('stocksense_role') || 'staff';
}

// Set user role in sessionStorage
function setUserRole(role) {
    sessionStorage.setItem('stocksense_role', role);
}

// Check if current user is admin
function isAdmin() {
    return getUserRole() === 'admin';
}

// Get current user ID
function getCurrentUserId() {
    return sessionStorage.getItem('stocksense_user_id') || 'anonymous';
}

// ======================================
// USER INITIALIZATION
// ======================================
// Creates or updates user document in Firestore
// This is required for the security rules to work
async function initializeUser(userId, email, role, displayName) {
    try {
        const userDoc = await usersRef.doc(userId).get();
        
        if (!userDoc.exists) {
            // Create new user document
            await usersRef.doc(userId).set({
                email: email,
                role: role,
                displayName: displayName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✓ User ${displayName} created with role: ${role}`);
        } else {
            console.log(`✓ User ${displayName} already exists`);
        }
    } catch (error) {
        console.error('Error initializing user:', error);
        // Fallback: Use sessionStorage if Firestore fails
        setUserRole(role);
    }
}

// ======================================
// INITIALIZATION ON LOAD
// ======================================
// Set up user authentication when page loads
document.addEventListener('DOMContentLoaded', async () => {
    const userId = getCurrentUserId();
    const userEmail = sessionStorage.getItem('stocksense_user') || 'unknown';
    const userRole = getUserRole();
    const displayName = sessionStorage.getItem('stocksense_display_name') || userEmail;
    
    // Initialize user in Firestore (for security rules)
    if (userId !== 'anonymous') {
        await initializeUser(userId, userEmail, userRole, displayName);
    }
});

// ======================================
// HELPER FUNCTIONS
// ======================================

// Format Firestore timestamp to readable date string
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
        return timestamp.toDate().toLocaleString();
    }
    return new Date(timestamp).toLocaleString();
}

// Format date for warranty display
function formatWarrantyDate(timestamp) {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
}

// Check if warranty is expiring soon (within 30 days)
function isWarrantyExpiringSoon(warrantyEnd) {
    if (!warrantyEnd) return false;
    const endDate = warrantyEnd.toDate ? warrantyEnd.toDate() : new Date(warrantyEnd);
    const now = new Date();
    const daysUntilExpiry = Math.floor((endDate - now) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
}

// Check if warranty is expired
function isWarrantyExpired(warrantyEnd) {
    if (!warrantyEnd) return false;
    const endDate = warrantyEnd.toDate ? warrantyEnd.toDate() : new Date(warrantyEnd);
    return new Date() > endDate;
}

// Calculate available stock (current - allocated)
function calculateAvailableStock(item) {
    return item.current_stock - (item.allocated_stock || 0);
}

// Check if item is below minimum threshold
function isBelowThreshold(item) {
    const available = calculateAvailableStock(item);
    return available < item.min_threshold;
}

// ======================================
// CONSOLE LOGGING
// ======================================
console.log('✓ Firebase initialized');
console.log('✓ Firestore collections configured:');
console.log('  - inventory (items with stock levels)');
console.log('  - transactions (immutable audit trail)');
console.log('  - allocation_logs (MA tracking)');
console.log('  - users (role management)');
console.log('✓ User role:', getUserRole());
console.log('✓ User ID:', getCurrentUserId());
