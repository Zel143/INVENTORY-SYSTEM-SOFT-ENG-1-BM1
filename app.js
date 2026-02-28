// ======================================
// STOCKSENSE — FRONTEND APP
// Connected to PostgreSQL backend via REST API + SSE
// ======================================

const API = 'http://localhost:3000/api';

// In-memory cache of current inventory (for sorting / modal lookups)
let inventory = [];
let currentUser = null;
let sortKey = null;
let sortAsc = true;

// ======================================
// BOOTSTRAP — run on page load
// ======================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check session — redirect if not authenticated
    try {
        const res = await fetch(`${API}/session`, { credentials: 'include' });
        const data = await res.json();
        if (!data.authenticated) {
            window.location.href = 'index.html';
            return;
        }
        currentUser = data.user;
        const display = document.getElementById('user-display');
        if (display) display.textContent = `${data.user.display_name} (${data.user.role})`;
    } catch {
        window.location.href = 'index.html';
        return;
    }

    setupTheme();
    await Promise.all([loadInventory(), loadAlerts()]);
    subscribeSSE();
    setupAddItemForm();
    setupTransactionForm();
});

// ======================================
// SSE — real-time inventory updates
// ======================================
function subscribeSSE() {
    const es = new EventSource(`${API}/events`, { withCredentials: true });
    es.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === 'inventory:updated' || event.type === 'inventory:added') {
            loadInventory();
            loadAlerts();
        }
    };
    es.onerror = () => {
        // Reconnection is handled automatically by EventSource
    };
}

// ======================================
// INVENTORY
// ======================================
async function loadInventory() {
    try {
        const res = await fetch(`${API}/inventory`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        inventory = await res.json();
        renderInventoryTable(inventory);
        updateMetrics(inventory);
    } catch (err) {
        document.getElementById('inventory-list').innerHTML =
            `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:2rem;">Failed to load inventory — ${err.message}</td></tr>`;
    }
}

function updateMetrics(data) {
    const totalAllocated = data.reduce((sum, i) => sum + (i.allocated_stock || 0), 0);
    const overstock = data.filter(i => i.current_stock > i.max_ceiling).length;
    const lowstock = data.filter(i => i.current_stock <= i.min_threshold).length;

    const el = (id) => document.getElementById(id);
    if (el('stat-total'))     el('stat-total').textContent     = data.length;
    if (el('stat-allocated')) el('stat-allocated').textContent = totalAllocated;
    if (el('stat-lowstock'))  el('stat-lowstock').textContent  = lowstock;
    if (el('stat-overstock')) el('stat-overstock').textContent = overstock;
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('inventory-list');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">No inventory items found.</td></tr>';
        return;
    }

    const today = new Date();
    tbody.innerHTML = data.map(item => {
        const wEnd = item.warranty_end ? new Date(item.warranty_end) : null;
        const wBadge = !wEnd
            ? '<span class="badge badge-gray">N/A</span>'
            : wEnd < today
                ? '<span class="badge badge-red">Expired</span>'
                : '<span class="badge badge-green">Active</span>';

        const available = (item.current_stock || 0) - (item.allocated_stock || 0);
        const stockClass = item.current_stock <= item.min_threshold ? 'style="color:var(--danger)"' : '';

        return `<tr>
            <td class="font-bold text-dark">${item.code}</td>
            <td><div class="desc-title">${item.description}</div></td>
            <td class="text-muted">${item.vendor || '—'}</td>
            <td class="font-bold" ${stockClass}>${item.current_stock}</td>
            <td><span class="badge badge-gray">${item.allocated_stock} MA</span></td>
            <td class="text-muted">${item.max_ceiling}</td>
            <td>${wBadge}</td>
            <td>
                <button class="btn-icon text-green" title="Restock" onclick="openModal('${item.code}', 'in')"><i class="fas fa-plus-circle"></i></button>
                <button class="btn-icon text-red" title="Dispatch" onclick="openModal('${item.code}', 'out')"><i class="fas fa-minus-circle"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// ======================================
// SORT
// ======================================
function sortTable(key) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'flex';

    setTimeout(() => {
        if (sortKey === key) {
            sortAsc = !sortAsc;
        } else {
            sortKey = key;
            sortAsc = true;
        }

        const sorted = [...inventory].sort((a, b) => {
            let valA = a[key] ?? '';
            let valB = b[key] ?? '';
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            if (valA < valB) return sortAsc ? -1 : 1;
            if (valA > valB) return sortAsc ? 1 : -1;
            return 0;
        });

        renderInventoryTable(sorted);
        if (spinner) spinner.style.display = 'none';
    }, 150);
}

// ======================================
// ALERTS (Low Stock)
// ======================================
async function loadAlerts() {
    try {
        const res = await fetch(`${API}/low-stock`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const items = await res.json();
        const list = document.getElementById('alerts-list');
        if (!list) return;

        if (!items.length) {
            list.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem;">No alerts — all stock levels are healthy.</p>';
            return;
        }

        list.innerHTML = items.map(item => `
            <div class="alert-item" style="padding:0.5rem 0; border-bottom: 1px solid var(--border-color);">
                <strong>${item.code}</strong> — ${item.description}<br>
                <small style="color:var(--danger)">Stock: ${item.current_stock} / Min: ${item.min_threshold}</small>
            </div>
        `).join('');
    } catch {
        const list = document.getElementById('alerts-list');
        if (list) list.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem;">Unable to load alerts.</p>';
    }
}

// ======================================
// STOCK TRANSACTION MODAL
// ======================================
function openModal(code, type) {
    const item = inventory.find(i => i.code === code);
    if (!item) return;

    document.getElementById('transModal').style.display = 'flex';
    document.getElementById('trans-id').value = code;
    document.getElementById('trans-type').value = type;
    document.getElementById('trans-qty').value = 1;

    const title = document.getElementById('trans-title');
    const subtitle = document.getElementById('trans-subtitle');
    const outLogic = document.getElementById('out-logic');
    const destInput = document.getElementById('destination');
    const purposeInput = document.getElementById('purpose');

    if (destInput) destInput.value = '';
    if (purposeInput) purposeInput.value = '';

    if (type === 'in') {
        title.innerText = 'Restock: ' + code;
        if (subtitle) subtitle.innerText = `${item.description} — Current stock: ${item.current_stock}`;
        outLogic.style.display = 'none';
    } else {
        title.innerText = 'Dispatch: ' + code;
        const available = item.current_stock - item.allocated_stock;
        if (subtitle) subtitle.innerText = `${item.description} — Available: ${available} (${item.current_stock} total, ${item.allocated_stock} reserved)`;
        outLogic.style.display = 'block';
    }
}

function closeTransModal() {
    document.getElementById('transModal').style.display = 'none';
}

function setupTransactionForm() {
    const form = document.getElementById('transForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const code = document.getElementById('trans-id').value;
        const type = document.getElementById('trans-type').value;
        const qty = parseInt(document.getElementById('trans-qty').value, 10);
        const destination = (document.getElementById('destination')?.value || '').trim();
        const purpose = (document.getElementById('purpose')?.value || '').trim();
        const btn = form.querySelector('button[type="submit"]');

        if (!qty || qty <= 0) {
            alert('Quantity must be a positive number.');
            return;
        }
        if (type === 'out' && !destination) {
            alert('Destination is required for dispatch operations.');
            return;
        }

        btn.textContent = 'Processing...';
        btn.disabled = true;

        const body = {
            quantity_change: type === 'in' ? qty : -qty,
            transaction_type: type === 'in' ? 'addition' : 'dispatch',
            destination: destination || undefined,
            purpose: purpose || undefined
        };

        try {
            const res = await fetch(`${API}/inventory/${code}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                closeTransModal();
                await loadInventory();
                await loadAlerts();
            } else {
                const msg = data.message || data.error || 'Transaction failed';
                alert(msg);
            }
        } catch {
            alert('Connection Error — Is the server running?');
        } finally {
            btn.textContent = 'Confirm';
            btn.disabled = false;
        }
    });
}

// ======================================
// ADD ITEM FORM
// ======================================
function setupAddItemForm() {
    const form = document.getElementById('addItemForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        btn.textContent = 'Adding...';
        btn.disabled = true;

        const body = {
            code:             document.getElementById('add-code').value.trim().toUpperCase(),
            description:      document.getElementById('add-name').value.trim(),
            vendor:           document.getElementById('add-vendor').value.trim() || null,
            date_delivered:   document.getElementById('add-delivery').value || null,
            warranty_end:     document.getElementById('add-warranty').value || null,
            current_stock:    parseInt(document.getElementById('add-qty').value, 10) || 0,
            min_threshold:    parseInt(document.getElementById('add-min').value, 10) || 5,
            max_ceiling:      parseInt(document.getElementById('add-max').value, 10) || 20,
        };

        if (!body.code || !body.description) {
            alert('Item Code and Description are required.');
            btn.textContent = 'Add Item';
            btn.disabled = false;
            return;
        }

        try {
            const res = await fetch(`${API}/inventory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                form.reset();
                await loadInventory();
                await loadAlerts();
                // Switch to tracker tab
                switchTab('tracker', document.querySelector('.nav-item'));
            } else {
                alert('Failed to add item: ' + (data.error || 'Unknown error'));
            }
        } catch {
            alert('Connection Error — Is the server running?');
        } finally {
            btn.textContent = 'Add Item';
            btn.disabled = false;
        }
    });
}

// ======================================
// TRANSACTION HISTORY
// ======================================
async function loadHistory() {
    const tbody = document.getElementById('history-list');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted);">Loading…</td></tr>';

    try {
        const res = await fetch(`${API}/transactions?limit=100`, { credentials: 'include' });
        if (res.status === 403) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted);">Transaction history is available to admins only.</td></tr>';
            return;
        }
        if (!res.ok) throw new Error('Failed');
        const txns = await res.json();

        if (!txns.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted);">No transactions yet.</td></tr>';
            return;
        }

        tbody.innerHTML = txns.map(t => {
            const when = new Date(t.timestamp).toLocaleString();
            const change = t.quantity_change > 0
                ? `<span style="color:var(--success)">+${t.quantity_change}</span>`
                : `<span style="color:var(--danger)">${t.quantity_change}</span>`;
            const dest = [t.destination, t.purpose].filter(Boolean).join(' / ') || '—';
            return `<tr>
                <td style="white-space:nowrap">${when}</td>
                <td>${t.actor_name || '—'}</td>
                <td>${t.item_id}</td>
                <td>${change}</td>
                <td>${dest}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">Failed to load history — ${err.message}</td></tr>`;
    }
}

// ======================================
// NAVIGATION TABS
// ======================================
function switchTab(tab, el) {
    document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const section = document.getElementById('view-' + tab);
    if (section) section.style.display = 'block';
    if (el) el.classList.add('active');

    if (tab === 'history') loadHistory();
}

// ======================================
// LOGOUT
// ======================================
async function logout() {
    try {
        await fetch(`${API}/logout`, { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    window.location.href = 'index.html';
}

// ======================================
// THEME
// ======================================
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
