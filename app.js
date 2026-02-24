// --- DATA INITIALIZATION ---
// Mock Data with Edge Cases for Frontend Testing
const defaultInventory = [
    // EXPIRED ITEMS (within 30 days)
    { id: 1, code: "MCH-001", name: "Forklift", vendor: "Toyota", quantity: 5, safety: 5, warranty: "2026-02-20", image: "https://cdn-icons-png.flaticon.com/512/2821/2821867.png", expiryDate: "2026-02-25", maxStock: 10 },
    { id: 2, code: "MCH-002", name: "Pallet Jack", vendor: "Uline", quantity: 2, safety: 5, warranty: "2027-05-20", image: "https://cdn-icons-png.flaticon.com/512/3229/3229986.png", expiryDate: "2026-03-01", maxStock: 8 },

    // OVERSTOCK ITEMS (quantity > maxStock)
    { id: 3, code: "EQP-104", name: "Conveyor Belt", vendor: "Bosch", quantity: 15, safety: 5, warranty: "2028-11-15", image: "https://cdn-icons-png.flaticon.com/512/1541/1541484.png", expiryDate: "2027-11-15", maxStock: 12 },
    { id: 4, code: "STR-201", name: "Shelving Unit", vendor: "IKEA", quantity: 8, safety: 5, warranty: "2026-06-10", image: "https://cdn-icons-png.flaticon.com/512/3143/3143160.png", expiryDate: "2026-06-10", maxStock: 6 },

    // LOW STOCK ALERTS (quantity < safety)
    { id: 5, code: "TOOL-301", name: "Safety Gloves", vendor: "3M", quantity: 2, safety: 10, warranty: "2026-12-01", image: "https://cdn-icons-png.flaticon.com/512/1598/1598964.png", expiryDate: "2026-12-01", maxStock: 50 },
    { id: 6, code: "TOOL-302", name: "Hard Hat", vendor: "MSA", quantity: 0, safety: 5, warranty: "2027-08-15", image: "https://cdn-icons-png.flaticon.com/512/1598/1598965.png", expiryDate: "2027-08-15", maxStock: 25 },

    // EDGE CASES
    { id: 7, code: "PART-401", name: "Conveyor Rollers", vendor: "Rexnord", quantity: 13, safety: 8, warranty: "2026-02-28", image: "https://cdn-icons-png.flaticon.com/512/1541/1541485.png", expiryDate: "2026-02-28", maxStock: 12 }, // Overstock + Expiring Soon
    { id: 8, code: "PART-402", name: "Pallet Wrap", vendor: "Uline", quantity: 1, safety: 3, warranty: "2026-01-15", image: "https://cdn-icons-png.flaticon.com/512/3229/3229987.png", expiryDate: "2026-01-15", maxStock: 20 }, // Expired + Low Stock
    { id: 9, code: "EQP-501", name: "Barcode Scanner", vendor: "Zebra", quantity: 7, safety: 5, warranty: "2028-03-10", image: "https://cdn-icons-png.flaticon.com/512/1541/1541486.png", expiryDate: "2028-03-10", maxStock: 8 }, // Normal stock
    { id: 10, code: "TOOL-601", name: "Torque Wrench", vendor: "Craftsman", quantity: 25, safety: 5, warranty: "2026-07-22", image: "https://cdn-icons-png.flaticon.com/512/1598/1598966.png", expiryDate: "2026-07-22", maxStock: 20 } // Overstock only
];

// Alert Thresholds (Business Rules)
const ALERT_THRESHOLDS = {
    EXPIRY_WARNING_DAYS: 30,  // Items expiring within 30 days
    EXPIRY_CRITICAL_DAYS: 7,  // Items expiring within 7 days (RED ALERT)
    OVERSTOCK_MULTIPLIER: 1.2  // Items with quantity > maxStock * 1.2 trigger overstock alert
};

// Load data from LocalStorage or use Default
let inventory = JSON.parse(localStorage.getItem('ss_inventory')) || defaultInventory;
let history = JSON.parse(localStorage.getItem('ss_history')) || [];

// --- CORE FUNCTIONS ---
document.addEventListener('DOMContentLoaded', () => {
    // Check Auth
    if (!sessionStorage.getItem("stocksense_logged_in")) {
        window.location.href = "index.html";
    }

    renderAll();
    setupTheme();
});

function saveData() {
    localStorage.setItem('ss_inventory', JSON.stringify(inventory));
    localStorage.setItem('ss_history', JSON.stringify(history));
    renderAll();
}

function renderAll() {
    renderTracker();
    renderInventory(inventory);
    renderHistory();
}

// 1. Render Tracker (Low Stock, Expired, Overstock Alerts)
function renderTracker() {
    const grid = document.getElementById('tracker-grid');
    grid.innerHTML = '';

    const alerts = getAllAlerts();

    if (alerts.length === 0) {
        grid.innerHTML = '<p class="empty-state">All systems nominal. No stock alerts.</p>';
        return;
    }

    alerts.forEach(alert => {
        const alertClass = getAlertClass(alert.type);
        const alertIcon = getAlertIcon(alert.type);
        const alertMessage = getAlertMessage(alert);

        grid.innerHTML += `
            <div class="stock-card ${alertClass}">
                <div class="card-img" style="background-image: url('${alert.item.image}')"></div>
                <div class="card-info">
                    <div class="alert-header">
                        <i class="${alertIcon}"></i>
                        <span class="alert-type">${alert.type.toUpperCase()}</span>
                    </div>
                    <h4>${alert.item.name}</h4>
                    <p class="warning-text">${alertMessage}</p>
                    <p class="vendor">Vendor: ${alert.item.vendor} | Code: ${alert.item.code}</p>
                </div>
            </div>
        `;
    });
}

// Helper Functions for Alert System
function getAllAlerts() {
    const alerts = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    inventory.forEach(item => {
        // Low Stock Alerts
        if (item.quantity < item.safety) {
            alerts.push({
                type: 'low-stock',
                item: item,
                severity: item.quantity === 0 ? 'critical' : 'warning',
                data: { current: item.quantity, safety: item.safety }
            });
        }

        // Expired/Expiring Alerts
        if (item.expiryDate) {
            const expiryDate = new Date(item.expiryDate);
            const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

            if (daysUntilExpiry <= ALERT_THRESHOLDS.EXPIRY_WARNING_DAYS) {
                alerts.push({
                    type: daysUntilExpiry <= ALERT_THRESHOLDS.EXPIRY_CRITICAL_DAYS ? 'expired-critical' : 'expired-warning',
                    item: item,
                    severity: daysUntilExpiry <= ALERT_THRESHOLDS.EXPIRY_CRITICAL_DAYS ? 'critical' : 'warning',
                    data: { daysUntilExpiry, expiryDate: item.expiryDate }
                });
            }
        }

        // Overstock Alerts
        if (item.maxStock && item.quantity > item.maxStock * ALERT_THRESHOLDS.OVERSTOCK_MULTIPLIER) {
            alerts.push({
                type: 'overstock',
                item: item,
                severity: 'warning',
                data: { current: item.quantity, maxStock: item.maxStock, threshold: item.maxStock * ALERT_THRESHOLDS.OVERSTOCK_MULTIPLIER }
            });
        }
    });

    return alerts;
}

function getAlertClass(type) {
    const classes = {
        'low-stock': 'red-alert',
        'expired-critical': 'red-alert',
        'expired-warning': 'yellow-alert',
        'overstock': 'blue-alert'
    };
    return classes[type] || 'red-alert';
}

function getAlertIcon(type) {
    const icons = {
        'low-stock': 'fas fa-exclamation-triangle',
        'expired-critical': 'fas fa-calendar-times',
        'expired-warning': 'fas fa-calendar-alt',
        'overstock': 'fas fa-warehouse'
    };
    return icons[type] || 'fas fa-exclamation-triangle';
}

function getAlertMessage(alert) {
    switch (alert.type) {
        case 'low-stock':
            return alert.data.current === 0
                ? `STOCKOUT: 0 Remaining (Safety: ${alert.data.safety})`
                : `LOW STOCK: ${alert.data.current} Remaining (Safety: ${alert.data.safety})`;

        case 'expired-critical':
            return `EXPIRED SOON: ${alert.data.daysUntilExpiry} days left (${alert.data.expiryDate})`;

        case 'expired-warning':
            return `EXPIRING: ${alert.data.daysUntilExpiry} days left (${alert.data.expiryDate})`;

        case 'overstock':
            return `OVERSTOCK: ${alert.data.current} units (Max: ${alert.data.maxStock}, Threshold: ${alert.data.threshold})`;

        default:
            return 'Alert detected';
    }
}

// 2. Render Inventory Table
function renderInventory(data) {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';
    data.forEach(item => {
        const statusClass = getStockStatusClass(item);
        const statusText = getStockStatusText(item);
        const expiryInfo = getExpiryInfo(item);
        const stockInfo = getStockInfo(item);

        list.innerHTML += `
            <tr>
                <td>
                    <div class="item-cell">
                        <img src="${item.image}" class="table-icon">
                        <div>
                            <strong>${item.name}</strong><br>
                            <small class="text-muted">${item.code} | ${item.vendor}</small>
                        </div>
                    </div>
                </td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="qty-display">
                        <span class="current-qty">${item.quantity}</span>
                        <small class="qty-details">${stockInfo}</small>
                    </div>
                </td>
                <td>
                    <div class="expiry-info">
                        ${expiryInfo}
                    </div>
                </td>
                <td>
                    <button class="btn-action btn-add" onclick="openModal(${item.id}, 'in')"><i class="fas fa-plus"></i></button>
                    <button class="btn-action btn-sub" onclick="openModal(${item.id}, 'out')"><i class="fas fa-minus"></i></button>
                </td>
            </tr>
        `;
    });
}

// Helper Functions for Inventory Display
function getStockStatusClass(item) {
    if (item.quantity === 0) return 'out';
    if (item.quantity < item.safety) return 'low';
    if (item.maxStock && item.quantity > item.maxStock * ALERT_THRESHOLDS.OVERSTOCK_MULTIPLIER) return 'overstock';
    return 'available';
}

function getStockStatusText(item) {
    if (item.quantity === 0) return 'Stockout';
    if (item.quantity < item.safety) return 'Low Stock';
    if (item.maxStock && item.quantity > item.maxStock * ALERT_THRESHOLDS.OVERSTOCK_MULTIPLIER) return 'Overstock';
    return 'Available';
}

function getStockInfo(item) {
    let info = `Safety: ${item.safety}`;
    if (item.maxStock) {
        info += ` | Max: ${item.maxStock}`;
    }
    return info;
}

function getExpiryInfo(item) {
    if (!item.expiryDate) return '<span class="text-muted">No expiry</span>';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryDate = new Date(item.expiryDate);
    const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

    let className = 'text-muted';
    let text = item.expiryDate;

    if (daysUntilExpiry <= ALERT_THRESHOLDS.EXPIRY_CRITICAL_DAYS) {
        className = 'text-red';
        text += ` (${daysUntilExpiry}d)`;
    } else if (daysUntilExpiry <= ALERT_THRESHOLDS.EXPIRY_WARNING_DAYS) {
        className = 'text-yellow';
        text += ` (${daysUntilExpiry}d)`;
    }

    return `<span class="${className}">${text}</span>`;
}

// 3. Render History
function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    // Sort by new first
    const sortedHistory = [...history].reverse(); 
    
    sortedHistory.forEach(log => {
        const colorClass = log.change > 0 ? 'text-green' : 'text-red';
        const sign = log.change > 0 ? '+' : '';
        
        list.innerHTML += `
            <tr>
                <td>${log.time}</td>
                <td>${log.user}</td>
                <td>${log.itemName}</td>
                <td class="${colorClass}">${sign}${log.change}</td>
                <td><small><strong>To:</strong> ${log.dest}<br><strong>Ref:</strong> ${log.purpose}</small></td>
            </tr>
        `;
    });
}

// --- INTERACTIVITY ---

// Search
function handleSearch(query) {
    const lower = query.toLowerCase();
    const filtered = inventory.filter(item => 
        item.name.toLowerCase().includes(lower) || 
        item.code.toLowerCase().includes(lower) ||
        item.vendor.toLowerCase().includes(lower)
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
function openModal(id, type) {
    const item = inventory.find(i => i.id === id);
    if(!item) return;

    document.getElementById('transModal').style.display = 'flex';
    document.getElementById('trans-id').value = id;
    
    const title = document.getElementById('trans-title');
    const outLogic = document.getElementById('out-logic');
    const inputChange = document.getElementById('trans-change');

    if (type === 'in') {
        title.innerText = "Restock: " + item.name;
        inputChange.value = 1;
        outLogic.style.display = 'none';
        document.getElementById('destination').value = "Warehouse";
        document.getElementById('purpose').value = "Restock";
    } else {
        title.innerText = "Dispatch: " + item.name;
        inputChange.value = -1;
        outLogic.style.display = 'block';
        document.getElementById('destination').value = "";
        document.getElementById('purpose').value = "";
    }
}

function closeTransModal() {
    document.getElementById('transModal').style.display = 'none';
}

// Handle Form Submit
document.getElementById('transForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('trans-id').value);
    const change = parseInt(document.getElementById('trans-change').value);
    const dest = document.getElementById('destination').value || "N/A";
    const purpose = document.getElementById('purpose').value || "General";

    // Update Logic
    const item = inventory.find(i => i.id === id);
    if (item) {
        const newQty = item.quantity + change;
        if (newQty < 0) {
            alert("Cannot reduce stock below 0");
            return;
        }
        item.quantity = newQty;

        // Add History
        history.push({
            time: new Date().toLocaleString(),
            user: sessionStorage.getItem("stocksense_user") || "Admin",
            itemName: item.name,
            change: change,
            dest: dest,
            purpose: purpose
        });

        saveData(); // Persist to LocalStorage
        closeTransModal();
    }
});

// Logout
function logout() {
    sessionStorage.removeItem("stocksense_logged_in");
    window.location.href = "index.html";
}

// Theme Switch
function setupTheme() {
    const toggle = document.getElementById('checkbox');
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
