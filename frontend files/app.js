// ===================== StockSense app.js — Backend Integrated =====================
let currentUser  = null;
let inventoryData = [];
let historyData   = [];
let invSortState  = {};
let histSortState = {};

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await checkSession();
    if (!currentUser) return;

    setupTheme();
    displayUserInfo();
    await Promise.all([loadInventory(), loadStats(), loadAlerts()]);
    setupAddItemForm();
    setupTransactionForm();
    subscribeSSE();

    // Hide admin-only elements for staff users (TC-9)
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
        list.innerHTML = '<tr><td colspan="8" class="empty-row">No inventory items found</td></tr>';
        return;
    }

    const today = new Date();
    data.forEach(item => {
        // Warranty badge (TC-35 / TC-36)
        let wBadge = '<span class="badge badge-gray">N/A</span>';
        if (item.warranty_end) {
            wBadge = new Date(item.warranty_end) < today
                ? '<span class="badge badge-red">Expired</span>'
                : '<span class="badge badge-green">Active</span>';
        }

        // TC-31 / TC-34: Low-stock and overstock row indicators
        const isLow  = item.min_threshold > 0 && item.current_stock <= item.min_threshold;
        const isOver = item.max_ceiling   > 0 && item.current_stock >  item.max_ceiling;
        const stockStyle = isLow  ? 'style="color:var(--color-red);font-weight:700;"' : '';
        const overBadge  = isOver ? '<span class="badge badge-yellow" title="Overstock" style="margin-left:4px;">Over</span>' : '';

        const deleteBtn = currentUser?.role === 'admin'
            ? `<button class="btn-icon text-muted admin-only" onclick="deleteItem('${item.code}')" title="Delete"><i class="fas fa-trash-alt"></i></button>`
            : '';

        list.innerHTML += `
            <tr>
                <td class="font-bold text-dark">${item.code}</td>
                <td><div class="desc-title">${item.name}</div><div class="desc-sub">${item.description || ''}</div></td>
                <td class="text-muted">${item.vendor || '—'}</td>
                <td ${stockStyle}>${item.current_stock}${overBadge}</td>
                <td><span class="badge badge-gray">${item.allocated_stock} MA</span></td>
                <td class="text-muted">${item.max_ceiling}</td>
                <td>${wBadge}</td>
                <td>
                    <button class="btn-icon text-green" onclick="openModal('${item.code}','in')" title="Restock"><i class="fas fa-plus-circle"></i></button>
                    <button class="btn-icon text-red"   onclick="openModal('${item.code}','out')" title="Dispatch"><i class="fas fa-minus-circle"></i></button>
                    ${deleteBtn}
                </td>
            </tr>`;
    });
}

// TC-24 – TC-30: Search / Filter
function filterInventory(query) {
    if (!query.trim()) { renderInventoryTable(inventoryData); return; }
    const q = query.toLowerCase();
    renderInventoryTable(inventoryData.filter(i =>
        i.code.toLowerCase().includes(q)        ||
        i.name.toLowerCase().includes(q)        ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.vendor      || '').toLowerCase().includes(q)
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
            code:           document.getElementById('add-code')?.value,
            name:           document.getElementById('add-name')?.value,
            description:    document.getElementById('add-desc')?.value,
            vendor:         document.getElementById('add-vendor')?.value,
            delivery_date:  document.getElementById('add-delivery')?.value,
            current_stock:  document.getElementById('add-qty')?.value,
            max_ceiling:    document.getElementById('add-max')?.value,
            min_threshold:  document.getElementById('add-min')?.value,
            warranty_start: document.getElementById('add-warranty-start')?.value,
            warranty_end:   document.getElementById('add-warranty-end')?.value,
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
async function loadHistory() {
    try {
        const res = await fetch('/api/transactions?limit=100');
        if (res.status === 403) {
            const tbody = document.getElementById('history-body');
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Transaction history is visible to admin users only.</td></tr>';
            return;
        }
        const data  = await res.json();
        historyData = data.transactions || [];
        renderHistory(historyData);
    } catch { /* non-critical */ }
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
    document.getElementById('view-' + tab).style.display = 'block';
    if (el) el.classList.add('active');
    if (tab === 'history') loadHistory();
}