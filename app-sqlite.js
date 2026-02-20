// ======================================
// STOCKSENSE - SQLITE VERSION
// Frontend with REST API Integration
// ======================================

const API_URL = 'http://localhost:3000/api';

// Default inventory data (used as fallback)
const defaultInventory = [
    { 
        code: "MCH-001", 
        description: "Forklift", 
        vendor: "Toyota", 
        current_stock: 5, 
        allocated_stock: 0, 
        min_threshold: 5, 
        max_ceiling: 15,
        date_delivered: "2025-01-15", 
        warranty_start: "2025-01-15", 
        warranty_end: "2030-01-01", 
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
        date_delivered: "2024-05-20", 
        warranty_start: "2024-05-20", 
        warranty_end: "2027-05-20", 
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
        date_delivered: "2025-11-15", 
        warranty_start: "2025-11-15", 
        warranty_end: "2028-11-15", 
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
        date_delivered: "2024-06-10", 
        warranty_start: "2024-06-10", 
        warranty_end: "2026-06-10", 
        storage_location: "Bin-D5", 
        image: "https://cdn-icons-png.flaticon.com/512/3143/3143160.png" 
    }
];

// Global state
let inventoryCache = [];
let transactionsCache = [];
let currentUser = null;

// ======================================
// API HELPER FUNCTIONS
// ======================================

async function apiCall(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            credentials: 'include', // Include cookies for session
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${API_URL}${endpoint}`, options);
        const data = await response.json();

        if (!response.ok) {
            // Preserve detailed error information for allocation breaches
            if (data.error === 'Allocation Breach' && data.message) {
                const error = new Error(data.message);
                error.details = data.details; // Preserve the detailed breakdown
                throw error;
            }
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error(`API Error [${method} ${endpoint}]:`, error);
        throw error;
    }
}

// ======================================
// AUTHENTICATION
// ======================================

async function checkSession() {
    try {
        const data = await apiCall('/session');
        if (data.authenticated) {
            currentUser = data.user;
            updateUserDisplay();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Session check failed:', error);
        return false;
    }
}

function updateUserDisplay() {
    if (!currentUser) return;

    const userEmail = document.getElementById('user-email');
    const userRole = document.getElementById('user-role');
    const userName = document.getElementById('user-name');

    if (userEmail) userEmail.textContent = currentUser.email;
    if (userName) userName.textContent = currentUser.display_name;
    
    if (userRole) {
        userRole.textContent = currentUser.role.toUpperCase();
        userRole.className = `user-role-badge role-${currentUser.role}`;
    }

    // Hide admin-only features for staff
    if (currentUser.role !== 'admin') {
        const historyTab = document.querySelector('[onclick*="history"]');
        if (historyTab) {
            historyTab.style.display = 'none';
        }
    }
}

function getUserRole() {
    return currentUser?.role || 'staff';
}

function isAdmin() {
    return currentUser?.role === 'admin';
}

function getCurrentUserId() {
    return currentUser?.id || 'unknown';
}

// ======================================
// DATA LOADING
// ======================================

async function loadInventory() {
    try {
        const data = await apiCall('/inventory');
        inventoryCache = data;
        return data;
    } catch (error) {
        console.error('Failed to load inventory:', error);
        showError('Failed to load inventory. Using cached data.');
        return inventoryCache;
    }
}

async function loadLowStock() {
    try {
        const data = await apiCall('/low-stock');
        return data;
    } catch (error) {
        console.error('Failed to load low stock:', error);
        return inventoryCache.filter(item => item.current_stock < item.min_threshold);
    }
}

async function loadTransactions() {
    try {
        if (!isAdmin()) {
            console.log('Transactions view is admin-only');
            return [];
        }
        const data = await apiCall('/transactions?limit=50');
        transactionsCache = data;
        return data;
    } catch (error) {
        console.error('Failed to load transactions:', error);
        return [];
    }
}

// ======================================
// INITIALIZATION
// ======================================

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const authenticated = await checkSession();
    
    if (!authenticated) {
        window.location.href = 'index.html';
        return;
    }

    // Load initial data
    await loadInventory();
    
    // Render all sections
    renderAll();
    setupTheme();

    // Set up auto-refresh (every 10 seconds)
    setInterval(async () => {
        await loadInventory();
        renderAll();
    }, 10000);
});

// ======================================
// RENDERING FUNCTIONS
// ======================================

function renderAll() {
    renderTracker();
    renderInventory(inventoryCache);
    if (isAdmin()) {
        renderHistory();
    }
}

// 1. Render Tracker (Low Stock)
async function renderTracker() {
    const grid = document.getElementById('tracker-grid');
    if (!grid) return;

    const lowStockItems = await loadLowStock();
    
    if (lowStockItems.length === 0) {
        grid.innerHTML = '<p style="color: #27ae60;">✅ All items are above minimum threshold!</p>';
        return;
    }

    grid.innerHTML = lowStockItems.map(item => `
        <div class="stock-card red-alert">
            <img src="${item.image}" alt="${item.description}" class="card-img">
            <div class="card-info">
                <h4>${item.description}</h4>
                <p class="warning-text">⚠️ LOW STOCK: ${item.current_stock} units</p>
                <p class="vendor">📍 ${item.storage_location}</p>
                <p class="vendor">Minimum: ${item.min_threshold}</p>
            </div>
        </div>
    `).join('');
}

// 2. Render Inventory Table
function renderInventory(data) {
    const tbody = document.querySelector('.inventory-table tbody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No inventory items found</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(item => {
        const status = item.current_stock < item.min_threshold ? 'out' : 'available';
        const statusText = status === 'out' ? 'LOW STOCK' : 'Available';
        
        // UAT ID 75: Calculate available stock (excluding allocated)
        const availableStock = item.current_stock - item.allocated_stock;
        const hasAllocated = item.allocated_stock > 0;
        
        // Visual warning if available stock is low even when total stock looks okay
        const availableClass = availableStock <= 0 ? 'text-red' : (availableStock < item.min_threshold ? 'text-yellow' : 'text-green');
        
        return `
            <tr>
                <td class="item-cell">
                    <img src="${item.image}" class="table-icon" alt="${item.description}">
                    <strong>${item.description}</strong>
                </td>
                <td>${item.code}</td>
                <td>${item.vendor || 'N/A'}</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <span style="font-weight: 600;">${item.current_stock} total</span>
                        ${hasAllocated ? `
                            <small style="color: #f59e0b; font-weight: 500;">
                                🔒 ${item.allocated_stock} allocated
                            </small>
                            <small class="${availableClass}" style="font-weight: 600;">
                                ✓ ${availableStock} available
                            </small>
                        ` : `
                            <small class="${availableClass}">
                                ${availableStock} available
                            </small>
                        `}
                    </div>
                </td>
                <td>${item.min_threshold}</td>
                <td>${item.storage_location || 'N/A'}</td>
                <td><span class="badge ${status}">${statusText}</span></td>
                <td>
                    <button class="btn-edit" onclick="openModal('${item.code}', 'addition')">Add</button>
                    <button class="btn-dispatch" onclick="openModal('${item.code}', 'dispatch')" 
                        ${availableStock <= 0 ? 'disabled title="No available stock"' : ''}>
                        Dispatch
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 3. Render History (Admin only)
async function renderHistory() {
    if (!isAdmin()) return;

    const tbody = document.querySelector('#history-table tbody');
    if (!tbody) return;

    const transactions = await loadTransactions();

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No transaction history</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map(log => {
        const changeClass = log.quantity_change > 0 ? 'badge available' : 'badge out';
        const changeText = log.quantity_change > 0 ? `+${log.quantity_change}` : log.quantity_change;
        
        return `
            <tr>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td>${log.item_name}</td>
                <td>${log.actor_name || log.actor_id}</td>
                <td><span class="${changeClass}">${changeText}</span></td>
                <td>${log.previous_stock} → ${log.new_stock}</td>
                <td>${log.destination || '-'}</td>
                <td>${log.purpose || '-'}</td>
            </tr>
        `;
    }).join('');
}

// ======================================
// INTERACTIVITY
// ======================================

// Search (UAT ID 15: Input sanitization)
function handleSearch(query) {
    // Sanitize search query to prevent XSS
    const sanitizedQuery = sanitizeInput(query).toLowerCase();
    
    if (!sanitizedQuery) {
        renderInventory(inventoryCache); // Show all if empty
        return;
    }
    
    const filtered = inventoryCache.filter(item => 
        item.description.toLowerCase().includes(sanitizedQuery) || 
        item.code.toLowerCase().includes(sanitizedQuery) ||
        (item.vendor && item.vendor.toLowerCase().includes(sanitizedQuery))
    );
    renderInventory(filtered);
}

// Tabs (UAT ID 28: Reset search on tab switch)
function switchTab(tab, el) {
    document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`view-${tab}`).style.display = 'block';
    el.classList.add('active');
    
    // UAT ID 28: Reset search box when switching tabs
    const searchBox = document.getElementById('search-box');
    if (searchBox && tab === 'tracker') {
        searchBox.value = '';
        renderInventory(inventoryCache); // Show all items
    }
}

// Modal Logic
let currentModalItem = null;
let currentModalType = null;

function openModal(code, type) {
    const item = inventoryCache.find(i => i.code === code);
    if (!item) return;

    currentModalItem = item;
    currentModalType = type;

    const modal = document.getElementById('transModal');
    const title = document.getElementById('modal-title');
    const itemDisplay = document.getElementById('modal-item-display');

    title.textContent = type === 'addition' ? 'Add Stock' : 'Dispatch Stock';
    itemDisplay.textContent = `${item.description} (${item.code})`;

    // Reset form
    document.getElementById('transForm').reset();

    modal.style.display = 'flex';
}

function closeTransModal() {
    document.getElementById('transModal').style.display = 'none';
    currentModalItem = null;
    currentModalType = null;
}

// Handle Form Submit
document.getElementById('transForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentModalItem) return;

    // ======================================
    // UAT ID 42, 45, 70: Zero-Trust Input Validation
    // ======================================
    const quantityInput = document.getElementById('quantity').value;
    const destination = document.getElementById('destination').value;
    const purpose = document.getElementById('purpose').value;

    // Validate quantity is a positive integer (no decimals, negatives, or zero)
    if (!quantityInput || quantityInput.trim() === '') {
        showError('⚠️ Quantity is required');
        return;
    }

    const quantity = parseInt(quantityInput, 10);

    // Reject if:
    // - Not a valid integer (NaN)
    // - Negative values (ID 42)
    // - Zero (ID 45)
    // - Decimal values (ID 70)
    if (isNaN(quantity) || quantity <= 0 || quantityInput.includes('.') || quantityInput.includes('-')) {
        showError('⚠️ Invalid Quantity: Must be a positive whole number (no decimals, negatives, or zero)');
        return;
    }

    // UAT ID 15, 50: Sanitize text inputs to prevent XSS/SQL injection
    const sanitizedDestination = sanitizeInput(destination);
    const sanitizedPurpose = sanitizeInput(purpose);

    // UAT ID 75: Pre-flight allocation check with visual feedback
    if (currentModalType === 'dispatch') {
        const availableStock = currentModalItem.current_stock - currentModalItem.allocated_stock;
        if (quantity > availableStock) {
            showError(`⚠️ ALLOCATION GUARDRAIL\n\nRequested: ${quantity} units\nAvailable: ${availableStock} units\nAllocated (Reserved): ${currentModalItem.allocated_stock} units\n\n❌ This transaction would breach reserved stock for Maintenance Agreements.`);
            return;
        }
    }

    const quantityChange = currentModalType === 'addition' ? quantity : -quantity;

    try {
        // Show loading
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Processing...';
        submitBtn.disabled = true;

        // Update stock via API (using sanitized inputs)
        await apiCall(`/inventory/${currentModalItem.code}`, 'PUT', {
            quantity_change: quantityChange,
            transaction_type: currentModalType,
            destination: sanitizedDestination || 'Warehouse',
            purpose: sanitizedPurpose || 'Stock update'
        });

        // Reload inventory
        await loadInventory();
        renderAll();

        // Close modal
        closeTransModal();
        
        showSuccess(`Stock updated successfully!`);

    } catch (error) {
        // Handle allocation breach with detailed information
        if (error.message && error.message.includes('Allocation Breach')) {
            // Parse the error response to get details
            showError(`⚠️ ALLOCATION GUARDRAIL ACTIVATED\n\n${error.message}\n\nReserved stock cannot be used for non-MA transactions. Please contact your supervisor or use unreserved inventory.`);
        } else {
            showError(error.message || 'Failed to update stock');
        }
        
        // Reset button
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Submit';
        submitBtn.disabled = false;
    }
});

// ======================================
// LOGOUT
// ======================================

async function logout() {
    try {
        await apiCall('/logout', 'POST');
        sessionStorage.clear();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout failed:', error);
        // Force logout anyway
        sessionStorage.clear();
        window.location.href = 'index.html';
    }
}

// ======================================
// THEME TOGGLE
// ======================================

function setupTheme() {
    const toggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme') || 'dark';
    
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (toggle) toggle.checked = savedTheme === 'light';

    if (toggle) {
        toggle.addEventListener('change', (e) => {
            const theme = e.target.checked ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        });
    }
}

// ======================================
// NOTIFICATIONS
// ======================================

function showError(message) {
    console.error('Error:', message);
    // You can add a toast notification here
    alert('❌ ' + message);
}

function showSuccess(message) {
    console.log('Success:', message);
    // You can add a toast notification here
    alert('✅ ' + message);
}

// ======================================
// UTILITY FUNCTIONS
// ======================================

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
}

// ======================================
// UAT ID 15, 50, 52: XSS & SQL Injection Protection
// ======================================

function sanitizeInput(input) {
    if (!input) return '';
    
    // Remove potential XSS vectors
    return String(input)
        .replace(/[<>"']/g, '') // Remove HTML/JS injection chars
        .replace(/[;\\]/g, '')  // Remove SQL statement terminators
        .trim()
        .substring(0, 500); // Limit length to prevent buffer overflow
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
