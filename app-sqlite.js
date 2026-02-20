// ======================================
// STOCKSENSE - SQLITE VERSION
// Frontend with REST API Integration
// ======================================

const API_URL = 'http://localhost:3000/api';

// Global state
let inventoryCache = [];
let transactionsCache = [];
let currentUser = null;

// ======================================
// NOTIFICATION BANNER (replaces alert)
// ======================================

function showBanner(message, type = 'error') {
    const banner = document.getElementById('notification-banner');
    if (!banner) return;
    banner.textContent = message;
    banner.className = `notification-banner ${type}`;
    banner.style.display = 'block';
    if (type === 'success') {
        setTimeout(hideBanner, 4000);
    }
}

function hideBanner() {
    const banner = document.getElementById('notification-banner');
    if (banner) banner.style.display = 'none';
}

function showError(message) {
    console.error('Error:', message);
    showBanner(message, 'error');
}

function showSuccess(message) {
    console.log('Success:', message);
    showBanner(message, 'success');
}

// ======================================
// LOADING STATE HELPER (UAT ID 29)
// ======================================

function setButtonLoading(btn, isLoading, defaultText = 'Submit') {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Processing...' : defaultText;
}

// ======================================
// API HELPER
// ======================================

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_URL}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
        // Preserve allocation breach detail
        if (data.error === 'Allocation Breach' && data.message) {
            const err = new Error(data.message);
            err.details = data.details;
            throw err;
        }
        throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
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
    } catch {
        return false;
    }
}

function updateUserDisplay() {
    if (!currentUser) return;

    const userName = document.getElementById('user-name');
    const userRole = document.getElementById('user-role');

    if (userName) userName.textContent = currentUser.display_name;
    if (userRole) {
        userRole.textContent = currentUser.role.toUpperCase();
        userRole.className = `user-role-badge role-${currentUser.role}`;
    }

    // Hide Transaction History tab for non-admins
    if (currentUser.role !== 'admin') {
        const historyTab = document.querySelector('[onclick*="history"]');
        if (historyTab) historyTab.style.display = 'none';
    }

    // Show Log New Stock button for admins only
    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) {
        addItemBtn.style.display = currentUser.role === 'admin' ? '' : 'none';
    }
}

function isAdmin() { return currentUser?.role === 'admin'; }

// ======================================
// DATA LOADING
// ======================================

async function loadInventory() {
    try {
        inventoryCache = await apiCall('/inventory');
    } catch (error) {
        showError('Failed to load inventory from server.');
    }
    return inventoryCache;
}

async function loadLowStock() {
    try {
        return await apiCall('/low-stock');
    } catch {
        return inventoryCache.filter(i => i.current_stock < i.min_threshold);
    }
}

async function loadTransactions() {
    if (!isAdmin()) return [];
    try {
        transactionsCache = await apiCall('/transactions?limit=50');
        return transactionsCache;
    } catch {
        return [];
    }
}

// ======================================
// FULL REFRESH — called after every mutation
// Guarantees UI reflects DB state within one round-trip
// ======================================

async function fetchInventory() {
    await loadInventory();
    renderAll();
}

// ======================================
// INITIALIZATION
// ======================================

document.addEventListener('DOMContentLoaded', async () => {
    const authenticated = await checkSession();
    if (!authenticated) {
        window.location.href = 'index.html';
        return;
    }

    await loadInventory();
    renderAll();
    setupTheme();

    // Register Add Item form handler
    const addItemForm = document.getElementById('addItemForm');
    if (addItemForm) addItemForm.addEventListener('submit', handleLogStock);

    // Register transaction form handler
    const transForm = document.getElementById('transForm');
    if (transForm) transForm.addEventListener('submit', updateStock);

    // Auto-refresh every 10 seconds
    setInterval(fetchInventory, 10000);
});

// ======================================
// RENDERING
// ======================================

function renderAll() {
    renderTracker();
    renderInventory(inventoryCache);
    if (isAdmin()) renderHistory();
}

async function renderTracker() {
    const grid = document.getElementById('tracker-grid');
    if (!grid) return;

    const items = await loadLowStock();
    if (!items.length) {
        grid.innerHTML = '<p style="color:#27ae60;">✅ All items are above minimum threshold!</p>';
        return;
    }

    grid.innerHTML = items.map(item => `
        <div class="stock-card red-alert">
            <img src="${item.image || ''}" alt="${item.description}" class="card-img"
                 onerror="this.style.display='none'">
            <div class="card-info">
                <h4>${item.description}</h4>
                <p class="warning-text">⚠️ LOW STOCK: ${item.current_stock} units</p>
                <p class="vendor">📍 ${item.storage_location || 'N/A'}</p>
                <p class="vendor">Minimum: ${item.min_threshold}</p>
            </div>
        </div>
    `).join('');
}

function renderInventory(data) {
    const tbody = document.querySelector('#view-inventory .inventory-table tbody');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No inventory items found</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(item => {
        const allocated = item.allocated_stock || 0;
        const available = item.current_stock - allocated;
        const status = item.current_stock < item.min_threshold ? 'out' : 'available';
        return `
            <tr>
                <td class="item-cell">
                    <img src="${item.image || ''}" class="table-icon" alt="${item.description}"
                         onerror="this.style.display='none'">
                    <strong>${item.description}</strong>
                </td>
                <td>${item.code}</td>
                <td>${item.vendor || 'N/A'}</td>
                <td>
                    ${item.current_stock}
                    <br><small class="avail-sub">Avail: ${available}</small>
                </td>
                <td>${item.min_threshold}</td>
                <td>${item.storage_location || 'N/A'}</td>
                <td><span class="badge ${status}">${status === 'out' ? 'LOW STOCK' : 'Available'}</span></td>
                <td class="action-cell">
                    <button class="btn-edit" onclick="openStockModal('${item.code}', 'addition')">Add</button>
                    <button class="btn-dispatch" onclick="openStockModal('${item.code}', 'dispatch')">Dispatch</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function renderHistory() {
    if (!isAdmin()) return;
    const tbody = document.querySelector('#history-table tbody');
    if (!tbody) return;

    const transactions = await loadTransactions();
    if (!transactions.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No transaction history</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map(log => {
        const cls = log.quantity_change > 0 ? 'badge available' : 'badge out';
        const txt = log.quantity_change > 0 ? `+${log.quantity_change}` : log.quantity_change;
        return `
            <tr>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td>${log.item_name}</td>
                <td>${log.actor_name || log.actor_id}</td>
                <td><span class="${cls}">${txt}</span></td>
                <td>${log.previous_stock} → ${log.new_stock}</td>
                <td>${log.destination || '-'}</td>
                <td>${log.purpose || '-'}</td>
            </tr>
        `;
    }).join('');
}

// ======================================
// SEARCH & SORT
// ======================================

function handleSearch(query) {
    const q = query.toLowerCase();
    renderInventory(inventoryCache.filter(item =>
        item.description.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.vendor && item.vendor.toLowerCase().includes(q))
    ));
}

let currentSort = { column: null, ascending: true };

function sortTable(column) {
    currentSort.ascending = currentSort.column === column ? !currentSort.ascending : true;
    currentSort.column = column;

    const sorted = [...inventoryCache].sort((a, b) => {
        let aVal = a[column] ?? '', bVal = b[column] ?? '';
        if (column === 'current_stock' || column === 'min_threshold') {
            aVal = Number(aVal); bVal = Number(bVal);
        } else {
            aVal = String(aVal).toLowerCase(); bVal = String(bVal).toLowerCase();
        }
        if (aVal < bVal) return currentSort.ascending ? -1 : 1;
        if (aVal > bVal) return currentSort.ascending ? 1 : -1;
        return 0;
    });

    document.querySelectorAll('.sortable').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (icon) icon.className = 'fas fa-sort sort-icon';
    });
    const active = document.querySelector(`[data-column="${column}"]`);
    if (active?.querySelector('.sort-icon')) {
        active.querySelector('.sort-icon').className =
            currentSort.ascending ? 'fas fa-sort-up sort-icon active' : 'fas fa-sort-down sort-icon active';
    }

    renderInventory(sorted);
}

function switchTab(tab, el) {
    document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`view-${tab}`).style.display = 'block';
    el.classList.add('active');
}

// ======================================
// STOCK TRANSACTION MODAL (Add / Dispatch)
// ======================================

let currentModalItem = null;
let currentModalType = null;

function openStockModal(code, type) {
    const item = inventoryCache.find(i => i.code === code);
    if (!item) return;

    currentModalItem = item;
    currentModalType = type;
    hideBanner();

    const allocated = item.allocated_stock || 0;
    const available = item.current_stock - allocated;

    document.getElementById('modal-title').textContent =
        type === 'addition' ? 'Add Stock' : 'Dispatch Stock';
    document.getElementById('modal-item-display').textContent =
        `${item.description} (${item.code})`;

    const stockInfo = document.getElementById('modal-stock-info');
    if (stockInfo) {
        stockInfo.innerHTML = type === 'dispatch'
            ? `Total: <strong>${item.current_stock}</strong>
               &nbsp;|&nbsp; Reserved (MA): <strong>${allocated}</strong>
               &nbsp;|&nbsp; <span class="avail-highlight">Available to Dispatch: <strong>${available}</strong></span>`
            : `Current Stock: <strong>${item.current_stock}</strong>`;
    }

    document.getElementById('transForm').reset();
    document.getElementById('transModal').style.display = 'flex';
}

// Backward-compat alias (onclick attributes in rendered HTML use openModal)
function openModal(code, type) { openStockModal(code, type); }

function closeTransModal() {
    document.getElementById('transModal').style.display = 'none';
    document.getElementById('transForm').reset();
    currentModalItem = null;
    currentModalType = null;
}

// updateStock — handles transForm submit (Add / Dispatch existing item)
async function updateStock(e) {
    e.preventDefault();
    if (!currentModalItem) return;

    const quantity = parseInt(document.getElementById('quantity').value);
    if (!quantity || quantity <= 0) { showError('Enter a valid quantity.'); return; }

    const destination = document.getElementById('destination').value;
    const purpose = document.getElementById('purpose').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    setButtonLoading(submitBtn, true);
    hideBanner();

    try {
        await apiCall(`/inventory/${currentModalItem.code}`, 'PUT', {
            quantity_change: currentModalType === 'addition' ? quantity : -quantity,
            transaction_type: currentModalType,
            destination: destination || 'Warehouse',
            purpose: purpose || 'Stock update'
        });

        closeTransModal();
        await fetchInventory();            // immediate full refresh
        showSuccess('Stock updated successfully.');
    } catch (error) {
        const msg = error.message || 'Failed to update stock.';
        showError(msg.includes('reserved for Maintenance')
            ? `⚠️ ALLOCATION GUARDRAIL ACTIVATED — ${msg}`
            : msg);
        setButtonLoading(submitBtn, false, 'Submit');
    }
}

// ======================================
// LOG NEW STOCK MODAL (Admin — new item)
// ======================================

function openAddItemModal() {
    if (!isAdmin()) return;
    hideBanner();
    document.getElementById('addItemForm').reset();
    document.getElementById('addItemModal').style.display = 'flex';
}

function closeAddItemModal() {
    document.getElementById('addItemModal').style.display = 'none';
    document.getElementById('addItemForm').reset();
}

// handleLogStock — handles addItemForm submit (create new inventory item)
async function handleLogStock(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, 'Add Item');
    hideBanner();

    const payload = {
        code:             document.getElementById('new-code').value.trim(),
        description:      document.getElementById('new-description').value.trim(),
        vendor:           document.getElementById('new-vendor').value.trim(),
        current_stock:    parseInt(document.getElementById('new-stock').value) || 0,
        allocated_stock:  parseInt(document.getElementById('new-allocated').value) || 0,
        min_threshold:    parseInt(document.getElementById('new-min').value) || 5,
        max_ceiling:      parseInt(document.getElementById('new-max').value) || 20,
        date_delivered:   document.getElementById('new-date-delivered').value || null,
        warranty_start:   document.getElementById('new-warranty-start').value || null,
        warranty_end:     document.getElementById('new-warranty-end').value || null,
        storage_location: document.getElementById('new-location').value.trim()
    };

    if (!payload.code || !payload.description) {
        showError('Item Code and Description are required.');
        setButtonLoading(submitBtn, false, 'Add Item');
        return;
    }

    try {
        await apiCall('/inventory', 'POST', payload);
        closeAddItemModal();
        await fetchInventory();            // immediate full refresh
        showSuccess(`"${payload.description}" added to inventory.`);
    } catch (error) {
        showError(error.message || 'Failed to add item.');
        setButtonLoading(submitBtn, false, 'Add Item');
    }
}

// ======================================
// LOGOUT
// ======================================

async function logout() {
    try { await apiCall('/logout', 'POST'); } catch { /* ignore network errors on logout */ }
    window.location.href = 'index.html';
}

// ======================================
// THEME
// ======================================

function setupTheme() {
    const toggle = document.getElementById('theme-toggle');
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    if (toggle) toggle.checked = saved === 'light';
    if (toggle) {
        toggle.addEventListener('change', e => {
            const theme = e.target.checked ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        });
    }
}

// ======================================
// FORMATTERS
// ======================================

function formatDate(d) { return d ? new Date(d).toLocaleDateString() : 'N/A'; }
function formatDateTime(d) { return d ? new Date(d).toLocaleString() : 'N/A'; }
