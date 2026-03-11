// ===================== StockSense app.js — Backend Integrated =====================
let currentUser  = null;
let inventoryData = [];
let historyData   = [];
let invSortState  = {};
let histSortState = {};
let histPage      = 1;
let histTotalPages = 1;

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await checkSession();
    if (!currentUser) return;

    setupTheme();
    displayUserInfo();
    await Promise.all([loadInventory(), loadStats(), loadAlerts()]);
    setupAddItemForm();
    setupTransactionForm();
    setupEditForm();
    setupAllocForm();
    setupAdminCreateUserForm();
    subscribeSSE();
    requestCameraPermission();

    // Hide admin-only elements for staff users
    if (currentUser.role !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }
});

// ===================== SESSION =====================
async function checkSession() {
    try {
        const res  = await fetch('/api/session');
        const data = await res.json();
        if (!data.authenticated) { window.location.href = 'index.html'; return null; }
        return data.user;
    } catch {
        window.location.href = 'index.html';
        return null;
    }
}

function displayUserInfo() {
    const el = document.getElementById('user-display');
    if (el && currentUser) el.textContent = `${currentUser.username} (${currentUser.role})`;
}

// ===================== INVENTORY =====================
async function loadInventory() {
    try {
        const res = await fetch('/api/inventory');
        if (!res.ok) throw new Error();
        inventoryData = await res.json();
        // Reapply search if active
        const q = document.getElementById('search-bar')?.value || '';
        filterInventory(q);
    } catch {
        showToast('Failed to load inventory', 'error');
    }
}

function renderInventoryTable(data) {
    const list = document.getElementById('inventory-list');
    if (!list) return;
    list.innerHTML = '';

    if (!data.length) {
        list.innerHTML = '<tr><td colspan="9" class="empty-row">No inventory items found</td></tr>';
        return;
    }

    const today = new Date();
    data.forEach(item => {
        // Warranty badge
        let wBadge = '<span class="badge badge-gray">N/A</span>';
        if (item.warranty_end) {
            wBadge = new Date(item.warranty_end) < today
                ? '<span class="badge badge-red">Expired</span>'
                : '<span class="badge badge-green">Active</span>';
        }

        // Stock health: color-coded rows
        const isOut  = item.current_stock === 0;
        const isLow  = !isOut && item.min_threshold > 0 && item.current_stock <= item.min_threshold;
        const isOver = item.max_ceiling > 0 && item.current_stock > item.max_ceiling;
        const isNormal = !isOut && !isLow && !isOver;

        let rowClass = '';
        if (isOut)       rowClass = 'row-out';
        else if (isLow)  rowClass = 'row-low';
        else if (isOver) rowClass = 'row-over';
        else             rowClass = 'row-normal';

        const available = item.current_stock - item.allocated_stock;
        const overBadge = isOver ? '<span class="badge badge-yellow" title="Overstock" style="margin-left:4px;">Over</span>' : '';

        const isAdmin   = currentUser?.role === 'admin';
        const deleteBtn = isAdmin
            ? `<button class="btn-icon text-muted admin-only" onclick="deleteItem('${item.code}')" title="Delete"><i class="fas fa-trash-alt"></i></button>`
            : '';
        const editBtn   = isAdmin
            ? `<button class="btn-icon text-blue admin-only" onclick="openEditModal('${item.code}')" title="Edit"><i class="fas fa-edit"></i></button>`
            : '';
        const allocBtn  = `<button class="btn-icon" onclick="openAllocModal('${item.code}')" title="Allocate/Deallocate" style="color:var(--accent-blue);"><i class="fas fa-exchange-alt"></i></button>`;

        // Sanitize code for use in onclick handlers
        const safeCode = item.code.replace(/'/g, "\\'");

        list.innerHTML += `
            <tr class="${rowClass}">
                <td class="font-bold text-dark">${item.code}</td>
                <td><div class="desc-title">${item.name}</div><div class="desc-sub">${item.description || ''}</div>
                    <span class="history-link" onclick="openItemHistoryModal('${safeCode}')"><i class="fas fa-history"></i> View History</span></td>
                <td class="text-muted">${item.category || '—'}</td>
                <td class="text-muted">${item.vendor || '—'}</td>
                <td>
                    <div class="quick-stock-group">
                        <button class="quick-btn quick-btn-minus" onclick="quickStockUpdate('${safeCode}', -1)" title="-1">−</button>
                        <span style="min-width:40px;text-align:center;font-weight:700;">${available}${overBadge}</span>
                        <button class="quick-btn quick-btn-plus" onclick="quickStockUpdate('${safeCode}', 1)" title="+1">+</button>
                    </div>
                </td>
                <td>${item.allocated_stock > 0 ? `<span class="badge badge-blue" title="${item.allocated_stock} reserved / ${item.current_stock} total"><i class="fas fa-lock" style="margin-right:4px;"></i>${item.allocated_stock}</span>` : '<span class="badge badge-gray">0</span>'}</td>
                <td class="text-muted">${item.max_ceiling}</td>
                <td>${wBadge}</td>
                <td>
                    <button class="btn-icon text-green" onclick="openModal('${safeCode}','in')" title="Restock"><i class="fas fa-plus-circle"></i></button>
                    <button class="btn-icon text-red"   onclick="openModal('${safeCode}','out')" title="Dispatch"><i class="fas fa-minus-circle"></i></button>
                    ${allocBtn}${editBtn}${deleteBtn}
                </td>
            </tr>`;
    });
}

// Search / Filter — by SKU, Part Name, Category, vendor
function filterInventory(query) {
    if (!query.trim()) { renderInventoryTable(inventoryData); return; }
    const q = query.toLowerCase();
    renderInventoryTable(inventoryData.filter(i =>
        i.code.toLowerCase().includes(q)        ||
        i.name.toLowerCase().includes(q)        ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.vendor      || '').toLowerCase().includes(q) ||
        (i.category    || '').toLowerCase().includes(q)
    ));
}

// ===================== STATS =====================
async function loadStats() {
    try {
        const data = await (await fetch('/api/stats')).json();
        const set  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('stat-total',     data.total_skus);
        set('stat-allocated', data.total_allocated);
        set('stat-lowstock',  data.low_stock);
        set('stat-overstock', data.over_stock);
    } catch { /* non-critical */ }
}

// ===================== ALERTS =====================
async function loadAlerts() {
    try {
        const items    = await (await fetch('/api/low-stock')).json();
        const container = document.getElementById('alerts-list');
        if (!container) return;
        container.innerHTML = '';
        if (!items.length) {
            container.innerHTML = '<p class="text-muted" style="font-size:0.85rem;padding:10px 0;">No active alerts</p>';
            return;
        }
        items.forEach(item => {
            container.innerHTML += `
                <div class="alert-item alert-red">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div><strong>${item.name}</strong> — ${item.current_stock} left (min: ${item.min_threshold})</div>
                </div>`;
        });
    } catch { /* non-critical */ }
}

// ===================== SORTING (inventory) =====================
function sortTable(key) {
    document.getElementById('loading-spinner').style.display = 'flex';
    setTimeout(() => {
        const dir = invSortState[key] === 'asc' ? 'desc' : 'asc';
        invSortState = { [key]: dir };
        const sorted = [...inventoryData].sort((a, b) => {
            let vA = a[key] ?? '', vB = b[key] ?? '';
            if (typeof vA === 'string') vA = vA.toLowerCase();
            if (typeof vB === 'string') vB = vB.toLowerCase();
            if (vA < vB) return dir === 'asc' ? -1 : 1;
            if (vA > vB) return dir === 'asc' ?  1 : -1;
            return 0;
        });
        renderInventoryTable(sorted);
        document.getElementById('loading-spinner').style.display = 'none';
    }, 150);
}

// ===================== MODAL — DISPATCH / RESTOCK =====================
function openModal(code, type) {
    const item = inventoryData.find(i => i.code === code);
    if (!item) return;

    document.getElementById('transModal').style.display = 'flex';
    document.getElementById('trans-id').value   = code;
    document.getElementById('trans-type').value = type;
    document.getElementById('trans-qty').value  = 1;

    const available = item.current_stock - item.allocated_stock;
    document.getElementById('trans-subtitle').textContent =
        `Available: ${available}  (${item.current_stock} total / ${item.allocated_stock} reserved)`;

    const outLogic = document.getElementById('out-logic');
    const inLogic  = document.getElementById('in-logic');

    if (type === 'in') {
        document.getElementById('trans-title').innerText = 'Restock Item: ' + item.code;
        if (outLogic) outLogic.style.display = 'none';
        if (inLogic)  inLogic.style.display  = 'block';
    } else {
        document.getElementById('trans-title').innerText = 'Dispatch Item: ' + item.code;
        if (outLogic) outLogic.style.display = 'block';
        if (inLogic)  inLogic.style.display  = 'none';
    }

    // TC-78: Auto-clear fields on every open
    ['trans-destination','trans-purpose','trans-source'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
}

function closeTransModal() {
    document.getElementById('transModal').style.display = 'none';
}

function setupTransactionForm() {
    const form = document.getElementById('transForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn  = form.querySelector('button[type=submit]');
        const code = document.getElementById('trans-id').value;
        const type = document.getElementById('trans-type').value;
        const qty  = parseInt(document.getElementById('trans-qty').value);
        const dest = document.getElementById('trans-destination')?.value || '';
        const purp = document.getElementById('trans-purpose')?.value    || '';
        const src  = document.getElementById('trans-source')?.value     || '';

        // TC-69: Zero-quantity guard
        if (!qty || qty <= 0) { showToast('Quantity must be greater than zero', 'error'); return; }
        // TC-66: Destination required for dispatch
        if (type === 'out' && !dest.trim()) { showToast('Destination is required for dispatch', 'error'); return; }
        // TC-73: Source required for restock
        if (type === 'in' && !src.trim()) { showToast('Source / Vendor is required for restocking', 'error'); return; }

        // TC-60: disable button immediately
        btn.disabled = true;

        try {
            const res = await fetch(`/api/inventory/${code}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quantity_change: type === 'in' ? qty : -qty,
                    destination: dest,
                    purpose: purp || src
                })
            });
            const data = await res.json();

            if (!res.ok) {
                // TC-76: Styled error toast
                let msg = data.error || 'Transaction failed';
                if (data.details) msg += ` (available: ${data.details.available})`;
                showToast(msg, 'error');
            } else {
                closeTransModal();
                showToast(type === 'in' ? 'Stock restocked successfully ✓' : 'Dispatch completed ✓', 'success');
                await Promise.all([loadInventory(), loadStats(), loadAlerts()]);
            }
        } catch {
            showToast('Network error — please try again', 'error');
        } finally {
            btn.disabled = false;
        }
    });
}

// ===================== ADD ITEM FORM =====================
function setupAddItemForm() {
    const form = document.getElementById('addItemForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled    = true;
        btn.textContent = 'Saving…';

        const payload = {
            code:            document.getElementById('add-code')?.value,
            name:            document.getElementById('add-name')?.value,
            category:        document.getElementById('add-category')?.value,
            description:     document.getElementById('add-desc')?.value,
            vendor:          document.getElementById('add-vendor')?.value,
            storage_location:document.getElementById('add-storage')?.value,
            delivery_date:   document.getElementById('add-delivery')?.value,
            current_stock:   document.getElementById('add-qty')?.value,
            max_ceiling:     document.getElementById('add-max')?.value,
            min_threshold:   document.getElementById('add-min')?.value,
            warranty_start:  document.getElementById('add-warranty-start')?.value,
            warranty_end:    document.getElementById('add-warranty-end')?.value,
        };

        try {
            const res  = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (!res.ok) {
                showToast(data.error || 'Failed to add item', 'error');
            } else {
                showToast('Item added successfully ✓', 'success');
                form.reset();
                await Promise.all([loadInventory(), loadStats()]);
                switchTab('tracker', document.querySelector('.nav-item'));
            }
        } catch {
            showToast('Network error — please try again', 'error');
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Save Item';
        }
    });
}

// ===================== DELETE ITEM (TC-56) =====================
async function deleteItem(code) {
    if (!confirm(`Delete item ${code}? This cannot be undone.`)) return;
    try {
        const res  = await fetch(`/api/inventory/${code}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) showToast(data.error || 'Delete failed', 'error');
        else {
            showToast('Item deleted', 'success');
            await Promise.all([loadInventory(), loadStats(), loadAlerts()]);
        }
    } catch { showToast('Network error', 'error'); }
}

// ===================== HISTORY =====================
async function loadHistory(page = histPage) {
    histPage = page;
    try {
        const res = await fetch(`/api/transactions?limit=50&page=${page}`);
        if (res.status === 403) {
            const tbody = document.getElementById('history-body');
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Transaction history is visible to admin users only.</td></tr>';
            return;
        }
        const data     = await res.json();
        historyData     = data.transactions || [];
        histTotalPages  = data.pages || 1;
        renderHistory(historyData);
        updatePaginationUI();
    } catch { /* non-critical */ }
}

function loadHistoryPage(page) {
    if (page < 1 || page > histTotalPages) return;
    loadHistory(page);
}

function updatePaginationUI() {
    const pag  = document.getElementById('history-pagination');
    const info = document.getElementById('pag-info');
    const prev = document.getElementById('pag-prev');
    const next = document.getElementById('pag-next');
    if (!pag) return;
    if (histTotalPages <= 1) { pag.style.display = 'none'; return; }
    pag.style.display = 'flex';
    if (info) info.textContent = `Page ${histPage} of ${histTotalPages}`;
    if (prev) prev.disabled = histPage <= 1;
    if (next) next.disabled = histPage >= histTotalPages;
}

function renderHistory(data) {
    const tbody = document.getElementById('history-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No transaction history yet</td></tr>';
        return;
    }

    data.forEach(t => {
        const sign  = t.quantity_change > 0 ? '+' : '';
        const cls   = t.quantity_change > 0 ? 'text-green' : 'text-red';
        tbody.innerHTML += `
            <tr>
                <td class="text-muted" style="font-size:0.85rem;">${new Date(t.timestamp).toLocaleString()}</td>
                <td>${t.actor_name || 'System'}</td>
                <td class="font-bold">${t.inventory_code}<br><span class="desc-sub">${t.item_name || ''}</span></td>
                <td class="${cls} font-bold">${sign}${t.quantity_change}</td>
                <td>${t.destination || t.purpose || '—'}</td>
            </tr>`;
    });
}

// TC-87 / TC-88 / TC-89: History search
function filterHistory(query) {
    if (!query.trim()) { renderHistory(historyData); return; }
    const q = query.toLowerCase();
    renderHistory(historyData.filter(t =>
        (t.inventory_code || '').toLowerCase().includes(q) ||
        (t.item_name      || '').toLowerCase().includes(q) ||
        (t.actor_name     || '').toLowerCase().includes(q) ||
        (t.destination    || '').toLowerCase().includes(q) ||
        (t.purpose        || '').toLowerCase().includes(q)
    ));
}

// TC-86: History column sorting
function sortHistory(key) {
    const dir = histSortState[key] === 'asc' ? 'desc' : 'asc';
    histSortState = { [key]: dir };
    renderHistory([...historyData].sort((a, b) => {
        let vA = a[key] ?? '', vB = b[key] ?? '';
        if (typeof vA === 'string') vA = vA.toLowerCase();
        if (typeof vB === 'string') vB = vB.toLowerCase();
        if (vA < vB) return dir === 'asc' ? -1 : 1;
        if (vA > vB) return dir === 'asc' ?  1 : -1;
        return 0;
    }));
}

// ===================== CSV EXPORT — TC-93/TC-94 =====================
function exportHistoryCSV() {
    if (!historyData.length) { showToast('No history data to export', 'error'); return; }
    const headers = ['Time', 'User', 'Item Code', 'Item Name', 'Change', 'Destination / Purpose'];
    const rows = historyData.map(t => [
        new Date(t.timestamp).toLocaleString(),
        t.actor_name || 'System',
        t.inventory_code,
        t.item_name || '',
        (t.quantity_change > 0 ? '+' : '') + t.quantity_change,
        t.destination || t.purpose || ''
    ]);
    const csv = [headers, ...rows]
        .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `stocksense_history_page${histPage}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV downloaded ✓', 'success');
}

// ===================== SSE — Real-time updates (TC-40) =====================
function subscribeSSE() {
    const es = new EventSource('/api/events');
    es.addEventListener('inventory:updated', () => {
        loadInventory(); loadStats(); loadAlerts();
    });
    es.addEventListener('inventory:added', () => {
        loadInventory(); loadStats();
    });
    // Browser auto-reconnects on error
}

// ===================== TOAST — TC-75 / TC-76 =====================
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-hide'); setTimeout(() => toast.remove(), 400); }, 3500);
}

// ===================== EDIT ITEM — TC-52/TC-53/TC-54 =====================
function openEditModal(code) {
    const item = inventoryData.find(i => i.code === code);
    if (!item) return;
    const el = id => document.getElementById(id);
    el('edit-code-display').textContent = code;
    el('edit-code').value           = code;
    el('edit-name').value           = item.name           || '';
    el('edit-category').value       = item.category       || '';
    el('edit-desc').value           = item.description    || '';
    el('edit-storage').value        = item.storage_location || '';
    el('edit-vendor').value         = item.vendor         || '';
    el('edit-delivery').value       = item.delivery_date  || '';
    el('edit-qty').value            = item.allocated_stock || 0;
    el('edit-min').value            = item.min_threshold  || 0;
    el('edit-max').value            = item.max_ceiling    || 999;
    el('edit-warranty-start').value = item.warranty_start || '';
    el('edit-warranty-end').value   = item.warranty_end   || '';
    el('editModal').style.display   = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

function setupEditForm() {
    const form = document.getElementById('editForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn  = form.querySelector('button[type=submit]');
        btn.disabled = true;
        const code = document.getElementById('edit-code').value;
        const payload = {
            name:            document.getElementById('edit-name').value,
            category:        document.getElementById('edit-category').value,
            description:     document.getElementById('edit-desc').value,
            storage_location:document.getElementById('edit-storage').value,
            vendor:          document.getElementById('edit-vendor').value,
            delivery_date:   document.getElementById('edit-delivery').value,
            allocated_stock: parseInt(document.getElementById('edit-qty').value) || 0,
            min_threshold:   document.getElementById('edit-min').value,
            max_ceiling:     document.getElementById('edit-max').value,
            warranty_start:  document.getElementById('edit-warranty-start').value,
            warranty_end:    document.getElementById('edit-warranty-end').value,
        };
        try {
            const res  = await fetch(`/api/inventory/${code}/details`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) showToast(data.error || 'Edit failed', 'error');
            else {
                closeEditModal();
                showToast('Item updated ✓', 'success');
                await Promise.all([loadInventory(), loadStats()]);
            }
        } catch {
            showToast('Network error', 'error');
        } finally {
            btn.disabled = false;
        }
    });
}

// ===================== MOBILE SIDEBAR — TC-23 =====================
function toggleSidebar() {
    document.querySelector('.sidebar')?.classList.toggle('sidebar-open');
}

// ===================== THEME =====================
function setupTheme() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const saved = localStorage.getItem('stocksense_theme');
    if (saved) {
        document.body.setAttribute('data-theme', saved);
        if (saved === 'dark') toggle.checked = true;
    }
    toggle.addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('stocksense_theme', theme);
    });
}

// ===================== NAVIGATION =====================
async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'index.html';
}

function switchTab(tab, el) {
    document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const section = document.getElementById('view-' + tab);
    if (section) section.style.display = 'block';
    if (el) el.classList.add('active');
    // Close sidebar on mobile after navigation
    document.querySelector('.sidebar')?.classList.remove('sidebar-open');
    if (tab === 'history') { histPage = 1; loadHistory(1); }
    if (tab === 'users' && currentUser?.role === 'admin') { loadUsers(); }
    if (tab === 'profile') { loadProfile(); }
}

// ===================== STOCK HEALTH FILTER =====================
function applyStockHealthFilter() {
    const filter = document.getElementById('stock-health-filter')?.value;
    if (!filter) { renderInventoryTable(inventoryData); return; }
    renderInventoryTable(inventoryData.filter(item => {
        const isOut = item.current_stock === 0;
        const isLow = !isOut && item.min_threshold > 0 && item.current_stock <= item.min_threshold;
        const isOver = item.max_ceiling > 0 && item.current_stock > item.max_ceiling;
        if (filter === 'out') return isOut;
        if (filter === 'low') return isLow;
        if (filter === 'over') return isOver;
        if (filter === 'normal') return !isOut && !isLow && !isOver;
        return true;
    }));
}

// ===================== QUICK STOCK +/- =====================
async function quickStockUpdate(code, delta) {
    try {
        const res = await fetch(`/api/inventory/${code}/quick-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delta })
        });
        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Update failed', 'error');
        } else {
            showToast(delta > 0 ? 'Stock +1 ✓' : 'Stock -1 ✓', 'success');
            await Promise.all([loadInventory(), loadStats(), loadAlerts()]);
        }
    } catch {
        showToast('Network error', 'error');
    }
}

// ===================== ALLOCATION TOGGLE MODAL =====================
function openAllocModal(code) {
    const item = inventoryData.find(i => i.code === code);
    if (!item) return;
    document.getElementById('allocModal').style.display = 'flex';
    document.getElementById('alloc-code').value = code;
    document.getElementById('alloc-code-display').textContent = code;
    document.getElementById('alloc-qty').value = 1;
    document.getElementById('alloc-purpose').value = '';
    const available = item.current_stock - item.allocated_stock;
    document.getElementById('alloc-subtitle').textContent =
        `Available: ${available} | Reserved: ${item.allocated_stock} | Total: ${item.current_stock}`;
    setAllocAction('allocate');
}

function closeAllocModal() {
    document.getElementById('allocModal').style.display = 'none';
}

function setAllocAction(action) {
    document.getElementById('alloc-action').value = action;
    document.getElementById('alloc-btn-reserve').classList.toggle('active', action === 'allocate');
    document.getElementById('alloc-btn-release').classList.toggle('active', action === 'deallocate');
}

function setupAllocForm() {
    const form = document.getElementById('allocForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        const code = document.getElementById('alloc-code').value;
        const action = document.getElementById('alloc-action').value;
        const qty = parseInt(document.getElementById('alloc-qty').value);
        const purpose = document.getElementById('alloc-purpose').value;
        if (!qty || qty <= 0) { showToast('Quantity must be greater than zero', 'error'); btn.disabled = false; return; }
        try {
            const res = await fetch(`/api/inventory/${code}/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity: qty, purpose })
            });
            const data = await res.json();
            if (!res.ok) showToast(data.error || 'Failed', 'error');
            else {
                closeAllocModal();
                showToast(action === 'allocate' ? 'Stock reserved ✓' : 'Stock released ✓', 'success');
                await Promise.all([loadInventory(), loadStats()]);
            }
        } catch { showToast('Network error', 'error'); }
        finally { btn.disabled = false; }
    });
}

// ===================== ITEM HISTORY MODAL =====================
async function openItemHistoryModal(code) {
    document.getElementById('itemHistoryModal').style.display = 'flex';
    document.getElementById('item-history-code').textContent = code;
    const tbody = document.getElementById('item-history-body');
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Loading…</td></tr>';
    try {
        const res = await fetch(`/api/transactions/item/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No movements recorded</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        data.forEach(t => {
            const sign = t.quantity_change > 0 ? '+' : '';
            const cls = t.quantity_change > 0 ? 'text-green' : 'text-red';
            tbody.innerHTML += `<tr>
                <td class="text-muted" style="font-size:0.85rem;">${new Date(t.timestamp).toLocaleString()}</td>
                <td>${t.actor_name || 'System'}</td>
                <td>${t.transaction_type}</td>
                <td class="${cls} font-bold">${sign}${t.quantity_change}</td>
                <td>${t.destination || t.purpose || '—'}</td>
            </tr>`;
        });
    } catch {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Failed to load history</td></tr>';
    }
}

function closeItemHistoryModal() {
    document.getElementById('itemHistoryModal').style.display = 'none';
}

// ===================== PROFILE PAGE =====================
async function loadProfile() {
    try {
        const res = await fetch('/api/profile');
        const user = await res.json();
        const el = id => document.getElementById(id);
        el('profile-fullname').textContent = user.full_name || '—';
        el('profile-username').textContent = user.username || '—';
        el('profile-email').textContent = user.email || '—';
        const roleBadge = el('profile-role');
        roleBadge.textContent = user.role === 'admin' ? 'Administrator' : 'Staff';
        roleBadge.className = 'badge ' + (user.role === 'admin' ? 'badge-blue' : 'badge-green');
        el('profile-status').innerHTML = user.is_active
            ? '<span class="badge badge-active">Active</span>'
            : '<span class="badge badge-inactive">Inactive</span>';
        el('profile-created').textContent = user.created_at ? new Date(user.created_at).toLocaleDateString() : '—';
    } catch { /* non-critical */ }
}

// ===================== ADMIN: USER MANAGEMENT =====================
async function loadUsers() {
    try {
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        const tbody = document.getElementById('users-list');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No users found</td></tr>';
            return;
        }
        users.forEach(u => {
            const statusBadge = u.is_active
                ? '<span class="badge badge-active">Active</span>'
                : '<span class="badge badge-inactive">Inactive</span>';
            const roleBadge = u.role === 'admin'
                ? '<span class="badge badge-blue">Admin</span>'
                : '<span class="badge badge-green">Staff</span>';
            const toggleBtn = u.is_active
                ? `<button class="btn-icon text-red" onclick="toggleUserActive(${u.id}, false)" title="Deactivate"><i class="fas fa-user-slash"></i></button>`
                : `<button class="btn-icon text-green" onclick="toggleUserActive(${u.id}, true)" title="Activate"><i class="fas fa-user-check"></i></button>`;
            const deleteBtn = `<button class="btn-icon text-muted" onclick="deleteUser(${u.id}, '${u.username}')" title="Delete"><i class="fas fa-trash-alt"></i></button>`;
            tbody.innerHTML += `<tr>
                <td>${u.id}</td>
                <td class="font-bold">${u.username}</td>
                <td>${u.full_name}</td>
                <td class="text-muted">${u.email}</td>
                <td>${roleBadge}</td>
                <td>${statusBadge}</td>
                <td class="text-muted" style="font-size:0.85rem;">${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                <td>${toggleBtn}${deleteBtn}</td>
            </tr>`;
        });
    } catch { showToast('Failed to load users', 'error'); }
}

async function toggleUserActive(id, activate) {
    const action = activate ? 'activate' : 'deactivate';
    try {
        const res = await fetch(`/api/admin/users/${id}/${action}`, { method: 'PUT' });
        const data = await res.json();
        if (!res.ok) showToast(data.error || 'Failed', 'error');
        else { showToast(`User ${action}d ✓`, 'success'); loadUsers(); }
    } catch { showToast('Network error', 'error'); }
}

async function deleteUser(id, username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) showToast(data.error || 'Failed', 'error');
        else { showToast('User deleted ✓', 'success'); loadUsers(); }
    } catch { showToast('Network error', 'error'); }
}

function setupAdminCreateUserForm() {
    const form = document.getElementById('adminCreateUserForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        const payload = {
            full_name: document.getElementById('admin-user-name').value,
            username:  document.getElementById('admin-user-username').value.trim().toLowerCase(),
            email:     document.getElementById('admin-user-email').value,
            password:  document.getElementById('admin-user-pass').value,
            role:      document.getElementById('admin-user-role').value
        };
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) showToast(data.error || 'Failed', 'error');
            else {
                showToast('User created ✓', 'success');
                form.reset();
                loadUsers();
            }
        } catch { showToast('Network error', 'error'); }
        finally { btn.disabled = false; }
    });
}

// ===================== REPORTS =====================
async function generateReport() {
    const startDate = document.getElementById('report-start')?.value || '';
    const endDate = document.getElementById('report-end')?.value || '';
    const category = document.getElementById('report-category')?.value || '';

    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (category) params.set('category', category);

    try {
        const res = await fetch(`/api/reports/inventory?${params}`);
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Report failed', 'error'); return; }

        document.getElementById('report-results').style.display = 'block';

        // Metrics
        const metrics = document.getElementById('report-metrics');
        metrics.innerHTML = `
            <div class="metric-card card-blue"><h4>Total Items</h4><div class="metric-value"><span>${data.summary.totalItems}</span></div></div>
            <div class="metric-card card-yellow"><h4>Low Stock</h4><div class="metric-value"><span>${data.summary.lowStock}</span></div></div>
            <div class="metric-card card-red"><h4>Out of Stock</h4><div class="metric-value"><span>${data.summary.outOfStock}</span></div></div>
            <div class="metric-card card-light"><h4>Overstock</h4><div class="metric-value"><span>${data.summary.overStock}</span></div></div>
        `;

        // Transaction summary
        const txBody = document.getElementById('report-tx-body');
        txBody.innerHTML = '';
        if (data.transactions.length) {
            data.transactions.forEach(t => {
                txBody.innerHTML += `<tr><td>${t.transaction_type}</td><td>${t.count}</td><td>${t.total_qty}</td></tr>`;
            });
        } else {
            txBody.innerHTML = '<tr><td colspan="3" class="empty-row">No transactions in this period</td></tr>';
        }

        // Item details
        const itemsBody = document.getElementById('report-items-body');
        itemsBody.innerHTML = '';
        data.items.forEach(item => {
            const healthBadge = {
                'normal': '<span class="badge badge-green">Normal</span>',
                'low': '<span class="badge badge-yellow">Low</span>',
                'out-of-stock': '<span class="badge badge-red">Out</span>',
                'over': '<span class="badge badge-yellow">Over</span>'
            }[item.stock_health] || '<span class="badge badge-gray">—</span>';
            itemsBody.innerHTML += `<tr>
                <td class="font-bold">${item.code}</td>
                <td>${item.name}</td>
                <td class="text-muted">${item.category || '—'}</td>
                <td>${item.current_stock}</td>
                <td>${item.allocated_stock}</td>
                <td>${healthBadge}</td>
            </tr>`;
        });

        showToast('Report generated ✓', 'success');
    } catch { showToast('Network error', 'error'); }
}

// ===================== CAMERA PERMISSION (future barcode scanning) =====================
function requestCameraPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    // Only request on mobile devices
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => { stream.getTracks().forEach(t => t.stop()); })
            .catch(() => { /* user denied — non-blocking */ });
    }
}