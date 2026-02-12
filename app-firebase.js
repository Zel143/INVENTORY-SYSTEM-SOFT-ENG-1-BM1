// ======================================
// STOCKSENSE - FIREBASE CLOUD VERSION
// Three-Collection Architecture with Security Rules
// ======================================
// Collections:
// - inventory: Item stock levels and metadata
// - transactions: Immutable audit trail ("Black Box")
// - allocation_logs: MA tracking and reserved stock
// ======================================

// Default inventory data for initialization
const defaultInventory = [
    { 
        code: "MCH-001", 
        description: "Forklift", 
        vendor: "Toyota", 
        current_stock: 5, 
        allocated_stock: 0, 
        min_threshold: 5, 
        max_ceiling: 15,
        date_delivered: new Date("2025-01-15"), 
        warranty_start: new Date("2025-01-15"), 
        warranty_end: new Date("2030-01-01"), 
        storage_location: "Bin-A1", 
        image: "https://cdn-icons-png.flaticon.com/512/2821/2821867.png" 
    },
    { 
        code: "MCH-002", 
        description: "Pallet Jack", 
        vendor: "Uline", 
        current_stock: 2, 
        allocated_stock: 0, 
        min_threshold: 5, 
        max_ceiling: 10,
        date_delivered: new Date("2024-05-20"), 
        warranty_start: new Date("2024-05-20"), 
        warranty_end: new Date("2027-05-20"), 
        storage_location: "Bin-B3", 
        image: "https://cdn-icons-png.flaticon.com/512/3229/3229986.png" 
    },
    { 
        code: "EQP-104", 
        description: "Conveyor Belt", 
        vendor: "Bosch", 
        current_stock: 4, 
        allocated_stock: 0, 
        min_threshold: 5, 
        max_ceiling: 8,
        date_delivered: new Date("2025-11-15"), 
        warranty_start: new Date("2025-11-15"), 
        warranty_end: new Date("2028-11-15"), 
        storage_location: "Bin-C2", 
        image: "https://cdn-icons-png.flaticon.com/512/1541/1541484.png" 
    },
    { 
        code: "STR-201", 
        description: "Shelving Unit", 
        vendor: "IKEA", 
        current_stock: 1, 
        allocated_stock: 0, 
        min_threshold: 5, 
        max_ceiling: 20,
        date_delivered: new Date("2024-06-10"), 
        warranty_start: new Date("2024-06-10"), 
        warranty_end: new Date("2026-06-10"), 
        storage_location: "Bin-D5", 
        image: "https://cdn-icons-png.flaticon.com/512/3143/3143160.png" 
    }
];

// Real-time listeners (unsubscribe functions)
let unsubscribeInventory = null;
let unsubscribeTransactions = null;

// Local cache for faster rendering
let inventoryCache = [];
let transactionsCache = [];

// ======================================
// INITIALIZATION
// ======================================
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    if (!sessionStorage.getItem("stocksense_logged_in")) {
        window.location.href = "index.html";
        return;
    }

    // Display user info
    const userName = sessionStorage.getItem("stocksense_display_name") || "User";
    const userRole = getUserRole();
    console.log(`✓ Logged in as: ${userName} (${userRole})`);

    // Initialize Firestore with default data if empty
    initializeFirestoreData();
    
    // Setup real-time listeners (Melprin's task)
    setupRealtimeListeners();
    
    setupTheme();
    
    // Show role indicator in UI
    updateRoleIndicator();
});

// ======================================
// FIRESTORE INITIALIZATION
// ======================================
async function initializeFirestoreData() {
    try {
        const snapshot = await inventoryRef.get();
        
        // If inventory is empty, seed with default data
        if (snapshot.empty) {
            console.log("Initializing Firestore with default inventory...");
            const batch = db.batch();
            
            defaultInventory.forEach(item => {
                const docRef = inventoryRef.doc(item.code);
                batch.set(docRef, {
                    description: item.description,
                    vendor: item.vendor,
                    current_stock: item.current_stock,
                    allocated_stock: item.allocated_stock || 0,
                    min_threshold: item.min_threshold,
                    max_ceiling: item.max_ceiling,
                    date_delivered: firebase.firestore.Timestamp.fromDate(item.date_delivered),
                    warranty_start: firebase.firestore.Timestamp.fromDate(item.warranty_start),
                    warranty_end: firebase.firestore.Timestamp.fromDate(item.warranty_end),
                    storage_location: item.storage_location,
                    image: item.image
                });
            });
            
            await batch.commit();
            console.log("✓ Default inventory initialized successfully");
        }
    } catch (error) {
        console.error("Error initializing Firestore:", error);
        if (error.code === 'permission-denied') {
            alert("⚠️ Permission denied. Please ensure firestore.rules are deployed and you're logged in.");
        } else {
            alert("Failed to initialize database. Check console for details.");
        }
    }
}

// ======================================
// REAL-TIME LISTENERS (Melprin's Implementation)
// ======================================
function setupRealtimeListeners() {
    // Listener 1: Inventory Collection
    unsubscribeInventory = inventoryRef.onSnapshot((snapshot) => {
        inventoryCache = [];
        snapshot.forEach((doc) => {
            inventoryCache.push({
                code: doc.id,
                ...doc.data()
            });
        });
        
        // Trigger UI updates
        renderAll();
    }, (error) => {
        console.error("Inventory listener error:", error);
        if (error.code === 'permission-denied') {
            alert("⚠️ You don't have permission to read inventory. Please check your user role.");
        }
    });

    // Listener 2: Transactions Collection (Admin only)
    if (isAdmin()) {
        unsubscribeTransactions = transactionsRef
            .orderBy('timestamp', 'desc')
            .limit(100)
            .onSnapshot((snapshot) => {
                transactionsCache = [];
                snapshot.forEach((doc) => {
                    transactionsCache.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                renderHistory();
            }, (error) => {
                console.error("Transactions listener error:", error);
            });
    } else {
        // Staff users see limited transaction history (their own only)
        console.log("ℹ️ Staff view: Limited transaction history");
        transactionsCache = [];
        renderHistory();
    }
}

function renderAll() {
    renderTracker();
    renderInventory(inventoryCache);
    renderHistory();
}

// ======================================
// 1. RENDER TRACKER (Low Stock Alerts)
// ======================================
function renderTracker() {
    const grid = document.getElementById('tracker-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    const alerts = inventoryCache.filter(i => isBelowThreshold(i));

    if (alerts.length === 0) {
        grid.innerHTML = '<p class="empty-state">✓ All systems nominal. No stock alerts.</p>';
        return;
    }

    alerts.forEach(item => {
        const available = calculateAvailableStock(item);
        const warrantyStatus = isWarrantyExpired(item.warranty_end) ? 
            ' | ⚠️ WARRANTY EXPIRED' : 
            isWarrantyExpiringSoon(item.warranty_end) ? 
            ' | ⏰ WARRANTY EXPIRING SOON' : '';
        
        grid.innerHTML += `
            <div class="stock-card red-alert">
                <div class="card-img" style="background-image: url('${item.image}')"></div>
                <div class="card-info">
                    <h4>${item.description}</h4>
                    <p class="warning-text">⚠️ CRITICAL: ${available} Available (${item.allocated_stock || 0} Allocated)</p>
                    <p class="vendor">Vendor: ${item.vendor}${warrantyStatus}</p>
                    <p class="vendor">Location: ${item.storage_location}</p>
                </div>
            </div>
        `;
    });
}

// ======================================
// 2. RENDER INVENTORY TABLE
// ======================================
function renderInventory(data) {
    const list = document.getElementById('inventory-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (data.length === 0) {
        list.innerHTML = '<tr><td colspan="4" class="empty-state">No inventory items found</td></tr>';
        return;
    }
    
    data.forEach(item => {
        const available = calculateAvailableStock(item);
        const statusClass = available > 0 ? 'available' : 'out';
        const statusText = available > 0 ? 'Available' : 'Stockout';
        const warrantyExpired = isWarrantyExpired(item.warranty_end);
        const warrantyWarning = warrantyExpired ? '⚠️ ' : isWarrantyExpiringSoon(item.warranty_end) ? '⏰ ' : '';
        
        list.innerHTML += `
            <tr>
                <td>
                    <div class="item-cell">
                        <img src="${item.image}" class="table-icon">
                        <div>
                            <strong>${item.description}</strong><br>
                            <small class="text-muted">${item.code} | ${item.vendor}</small><br>
                            <small class="text-muted">📍 ${item.storage_location}</small><br>
                            <small class="text-muted">${warrantyWarning}Warranty: ${formatWarrantyDate(item.warranty_end)}</small>
                        </div>
                    </div>
                </td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <span class="qty-display">${available}</span>
                    ${item.allocated_stock > 0 ? `<br><small class="text-muted">(${item.allocated_stock} allocated)</small>` : ''}
                    <br><small class="text-muted">Total: ${item.current_stock}</small>
                </td>
                <td>
                    <button class="btn-action btn-add" onclick="openModal('${item.code}', 'in')"><i class="fas fa-plus"></i></button>
                    <button class="btn-action btn-sub" onclick="openModal('${item.code}', 'out')" ${available === 0 ? 'disabled' : ''}><i class="fas fa-minus"></i></button>
                </td>
            </tr>
        `;
    });
}

// ======================================
// 3. RENDER HISTORY (Transactions)
// ======================================
function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (!isAdmin()) {
        list.innerHTML = '<tr><td colspan="5" class="empty-state">⚠️ Transaction history is restricted to Admin users only<br><small>This enforces the "Black Box" audit trail protection</small></td></tr>';
        return;
    }
    
    if (transactionsCache.length === 0) {
        list.innerHTML = '<tr><td colspan="5" class="empty-state">No transaction history</td></tr>';
        return;
    }
    
    transactionsCache.forEach(log => {
        const colorClass = log.quantity_change > 0 ? 'text-green' : 'text-red';
        const sign = log.quantity_change > 0 ? '+' : '';
        const timestamp = formatTimestamp(log.timestamp);
        
        list.innerHTML += `
            <tr>
                <td>${timestamp}</td>
                <td>${log.actor_id || 'Unknown'}</td>
                <td>${log.item_name || 'N/A'}</td>
                <td class="${colorClass}">${sign}${log.quantity_change}</td>
                <td><small><strong>To:</strong> ${log.destination || 'N/A'}<br><strong>Ref:</strong> ${log.purpose || 'N/A'}</small></td>
            </tr>
        `;
    });
}

// ======================================
// INTERACTIVITY
// ======================================

// Search
function handleSearch(query) {
    const lower = query.toLowerCase();
    const filtered = inventoryCache.filter(item => 
        item.description.toLowerCase().includes(lower) || 
        item.code.toLowerCase().includes(lower) ||
        item.vendor.toLowerCase().includes(lower) ||
        item.storage_location.toLowerCase().includes(lower)
    );
    renderInventory(filtered);
}

// Tabs
function switchTab(tab, el) {
    document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-' + tab).style.display = 'block';
    el.classList.add('active');
}

// Modal Logic
function openModal(code, type) {
    const item = inventoryCache.find(i => i.code === code);
    if(!item) return;

    document.getElementById('transModal').style.display = 'flex';
    document.getElementById('trans-id').value = code;
    
    const title = document.getElementById('trans-title');
    const outLogic = document.getElementById('out-logic');
    const inputChange = document.getElementById('trans-change');
    const available = calculateAvailableStock(item);

    if (type === 'in') {
        title.innerText = "📦 Restock: " + item.description;
        inputChange.value = 1;
        inputChange.min = 1;
        inputChange.removeAttribute('max');
        outLogic.style.display = 'none';
        document.getElementById('destination').value = "Warehouse";
        document.getElementById('purpose').value = "Restock";
    } else {
        title.innerText = "📤 Dispatch: " + item.description;
        title.innerText += ` (${available} available)`;
        inputChange.value = -1;
        inputChange.max = -1;
        inputChange.min = -available; // Can't dispatch more than available
        outLogic.style.display = 'block';
        document.getElementById('destination').value = "";
        document.getElementById('purpose').value = "";
    }
}

function closeTransModal() {
    document.getElementById('transModal').style.display = 'none';
}

// ======================================
// HANDLE FORM SUBMIT (Firestore Write)
// ======================================
document.getElementById('transForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const code = document.getElementById('trans-id').value;
    const change = parseInt(document.getElementById('trans-change').value);
    const dest = document.getElementById('destination').value || "N/A";
    const purpose = document.getElementById('purpose').value || "General";

    try {
        // Get current item data
        const itemDoc = await inventoryRef.doc(code).get();
        if (!itemDoc.exists) {
            alert("Item not found!");
            return;
        }

        const item = itemDoc.data();
        const available = calculateAvailableStock(item);
        const newStock = item.current_stock + change;

        // Validation: Can't go below allocated stock
        if (change < 0 && Math.abs(change) > available) {
            alert(`❌ Cannot dispatch more than available stock!\n\nAvailable: ${available}\nAllocated: ${item.allocated_stock || 0}\nTotal: ${item.current_stock}`);
            return;
        }

        // Validation: Can't go negative
        if (newStock < 0) {
            alert("❌ Cannot reduce stock below 0");
            return;
        }

        // Update inventory (Security rules will check if user can do this)
        await inventoryRef.doc(code).update({
            current_stock: newStock
        });

        // Add transaction record (IMMUTABLE - creates "Black Box" audit trail)
        await transactionsRef.add({
            item_id: inventoryRef.doc(code),
            item_name: item.description,
            actor_id: getCurrentUserId(),
            quantity_change: change,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            destination: dest,
            purpose: purpose
        });

        console.log(`✓ Transaction completed: ${item.description} ${change > 0 ? '+' : ''}${change}`);
        closeTransModal();
        
    } catch (error) {
        console.error("Transaction error:", error);
        if (error.code === 'permission-denied') {
            alert("⚠️ Permission denied. You don't have access to perform this operation.\n\nCheck your user role and security rules.");
        } else {
            alert(`❌ Transaction failed: ${error.message}\n\nCheck console for details.`);
        }
    }
});

// ======================================
// ROLE INDICATOR
// ======================================
function updateRoleIndicator() {
    const roleElement = document.querySelector('.user-role-badge');
    if (roleElement) {
        const role = getUserRole();
        roleElement.textContent = role.toUpperCase();
        roleElement.className = `user-role-badge role-${role}`;
    }
}

// ======================================
// LOGOUT
// ======================================
function logout() {
    // Unsubscribe from listeners
    if (unsubscribeInventory) unsubscribeInventory();
    if (unsubscribeTransactions) unsubscribeTransactions();
    
    // Clear all session data
    sessionStorage.clear();
    
    window.location.href = "index.html";
}

// ======================================
// THEME SWITCH
// ======================================
function setupTheme() {
    const toggle = document.getElementById('checkbox');
    if (!toggle) return;
    
    const saved = localStorage.getItem('theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
        if (saved === 'dark') toggle.checked = true;
    }
    toggle.addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    });
}

// ======================================
// CLEANUP ON PAGE UNLOAD
// ======================================
window.addEventListener('beforeunload', () => {
    if (unsubscribeInventory) unsubscribeInventory();
    if (unsubscribeTransactions) unsubscribeTransactions();
});

// ======================================
// CONSOLE WELCOME MESSAGE
// ======================================
console.log('%c🏭 StockSense - Cloud Version', 'font-size: 16px; font-weight: bold; color: #3498db;');
console.log('%cThree-Collection Architecture Active', 'color: #27ae60;');
console.log('✓ inventory: Stock levels and metadata');
console.log('✓ transactions: Immutable audit trail ("Black Box")');
console.log('✓ allocation_logs: MA tracking');
console.log('%cSecurity Rules Enforced:', 'color: #e74c3c; font-weight: bold;');
console.log('  - Staff: Can update stock, cannot change thresholds');
console.log('  - Admin: Full access to all operations');
console.log('  - Transactions: IMMUTABLE (no one can edit/delete)');
