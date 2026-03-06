// ============================================================
// StockSense Inventory Management System â€” Frontend Logic
// Version: 2.0  |  All data served from Express/Supabase API
// ============================================================

// ---- App State ----
let inventoryData  = [];
let historyData    = [];
let histPage       = 1;
let histTotalPages = 1;
let invSortState   = {};
let histSortState  = {};
let currentUser    = null;
let sseSource      = null;

const ALERT_THRESHOLDS = {
    EXPIRY_WARNING_DAYS:  30,
    EXPIRY_CRITICAL_DAYS:  7,
    OVERSTOCK_MULTIPLIER: 1.2
};

// ---- BOOT ----
document.addEventListener('DOMContentLoaded', async () => {
    let session;
    try {
        const r = await fetch('/api/session');
        session = await r.json();
    } catch (_) { window.location.href = 'index.html'; return; }

    if (!session.authenticated) { window.location.href = 'index.html'; return; }

    currentUser = session.user;
    const ud = document.getElementById('user-display');
    if (ud) ud.textContent = currentUser.username;

    if (currentUser.role !== 'admin')
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');

    setupTheme();
    setupTransactionForm();
    setupAddItemForm();
    setupSSE();
    await loadInventory();
});

// ---- INVENTORY ----
async function loadInventory() {
    try {
        const res = await fetch('/api/inventory');
        if (res.status === 401) { window.location.href = 'index.html'; return; }
        inventoryData = await res.json();
        renderTracker();
        renderInventoryTable(inventoryData);
    } catch (_) { showToast('Failed to load inventory', 'error'); }
}

// ---- SSE (TC-40) ----
function setupSSE() {
    if (sseSource) sseSource.close();
    sseSource = new EventSource('/api/events');
    sseSource.addEventListener('inventory:updated', () => loadInventory());
    sseSource.addEventListener('inventory:added',   () => loadInventory());
}

// ---- ALERTS TRACKER ----
function renderTracker() {
    const grid = document.getElementById('tracker-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const alerts = getAllAlerts();
    if (alerts.length === 0) {
        grid.innerHTML = '<p class="empty-state">All systems nominal. No stock alerts.</p>';
        return;
    }
    alerts.forEach(alert => {
        grid.innerHTML += `
        <div class="stock-card ${getAlertClass(alert.type)}">
            <div class="card-img" style="background-image:url('${alert.item.image||''}')"></div>
            <div class="card-info">
                <div class="alert-header">
                    <i class="${getAlertIcon(alert.type)}"></i>
                    <span class="alert-type">${alert.type.replace(/-/g,' ').toUpperCase()}</span>
                </div>
                <h4>${escHtml(alert.item.name)}</h4>
                <p class="warning-text">${getAlertMessage(alert)}</p>
                <p class="vendor">Vendor: ${escHtml(alert.item.vendor||'N/A')} | Code: ${escHtml(alert.item.code)}</p>
            </div>
        </div>`;
    });
}

function getAllAlerts() {
    const alerts = [];
    const today  = new Date(); today.setHours(0,0,0,0);
    inventoryData.forEach(item => {
        if (item.min_threshold > 0 && item.current_stock <= item.min_threshold)
            alerts.push({ type:'low-stock', item, severity: item.current_stock===0?'critical':'warning',
                data:{ current:item.current_stock, safety:item.min_threshold } });
        if (item.warranty_end) {
            const d = Math.ceil((new Date(item.warranty_end)-today)/86400000);
            if (d <= ALERT_THRESHOLDS.EXPIRY_WARNING_DAYS)
                alerts.push({ type: d<=ALERT_THRESHOLDS.EXPIRY_CRITICAL_DAYS?'expired-critical':'expired-warning',
                    item, severity: d<=ALERT_THRESHOLDS.EXPIRY_CRITICAL_DAYS?'critical':'warning',
                    data:{ daysUntilExpiry:d, expiryDate:item.warranty_end } });
        }
        if (item.max_ceiling && item.current_stock > item.max_ceiling * ALERT_THRESHOLDS.OVERSTOCK_MULTIPLIER)
            alerts.push({ type:'overstock', item, severity:'warning',
                data:{ current:item.current_stock, maxStock:item.max_ceiling } });
    });
    return alerts;
}

function getAlertClass(t) { return {
    'low-stock':'red-alert','expired-critical':'red-alert',
    'expired-warning':'yellow-alert','overstock':'blue-alert'}[t]||'red-alert'; }

function getAlertIcon(t) { return {
    'low-stock':'fas fa-exclamation-triangle','expired-critical':'fas fa-calendar-times',
    'expired-warning':'fas fa-calendar-alt','overstock':'fas fa-warehouse'}[t]||'fas fa-exclamation-triangle'; }

function getAlertMessage(a) {
    if (a.type==='low-stock') return a.data.current===0
        ? `STOCKOUT: 0 Remaining (Safety: ${a.data.safety})`
        : `LOW STOCK: ${a.data.current} Remaining (Safety: ${a.data.safety})`;
    if (a.type==='expired-critical') return `CRITICAL: ${a.data.daysUntilExpiry} days left (${a.data.expiryDate})`;
    if (a.type==='expired-warning')  return `EXPIRING: ${a.data.daysUntilExpiry} days left (${a.data.expiryDate})`;
    if (a.type==='overstock')        return `OVERSTOCK: ${a.data.current} units (Max: ${a.data.maxStock})`;
    return 'Alert detected';
}

// ---- INVENTORY TABLE ----
function renderInventoryTable(data) {
    const list = document.getElementById('inventory-list');
    if (!list) return;
    if (!data.length) {
        list.innerHTML = `<tr><td colspan="6" class="empty-state">No inventory items found</td></tr>`;
        return;
    }
    list.innerHTML = data.map(item => {
        const isOver     = item.max_ceiling > 0 && item.current_stock > item.max_ceiling;
        const overBadge  = isOver ? ` <span class="badge badge-yellow">Over</span>` : '';
        const wEnd       = item.warranty_end ? new Date(item.warranty_end) : null;
        const today2     = new Date(); today2.setHours(0,0,0,0);
        const wBadge     = !wEnd ? '<span class="badge badge-secondary">N/A</span>'
            : wEnd < today2 ? '<span class="badge badge-red">Expired</span>'
            : '<span class="badge badge-green">Active</span>';
        const daysLeft   = wEnd ? Math.ceil((wEnd-today2)/86400000) : null;
        let expCls='text-muted', expSfx='';
        if (daysLeft!==null && daysLeft<=ALERT_THRESHOLDS.EXPIRY_CRITICAL_DAYS) { expCls='text-red';    expSfx=` (${daysLeft}d)`; }
        else if (daysLeft!==null && daysLeft<=ALERT_THRESHOLDS.EXPIRY_WARNING_DAYS) { expCls='text-yellow'; expSfx=` (${daysLeft}d)`; }
        const expiryHtml = item.warranty_end
            ? `<span class="${expCls}">${item.warranty_end}${expSfx}</span>`
            : '<span class="text-muted">No expiry</span>';
        const delBtn = currentUser && currentUser.role==='admin'
            ? `<button class="btn-action btn-delete admin-only" onclick="deleteItem('${item.code}')" title="Delete"><i class="fas fa-trash-alt"></i></button>` : '';
        return `<tr>
            <td><div class="item-cell">
                <img src="${item.image||'https://cdn-icons-png.flaticon.com/512/1441/1441775.png'}" class="table-icon"
                     onerror="this.src='https://cdn-icons-png.flaticon.com/512/1441/1441775.png'">
                <div><strong>${escHtml(item.name)}</strong><br>
                    <small class="text-muted">${escHtml(item.code)} | ${escHtml(item.vendor||'N/A')}</small></div>
            </div></td>
            <td><span class="badge ${getStockStatusClass(item)}">${getStockStatusText(item)}</span></td>
            <td><div class="qty-display">
                <span class="current-qty">${item.current_stock}${overBadge}</span>
                <small class="qty-details">Safety: ${item.min_threshold}${item.max_ceiling?` | Max: ${item.max_ceiling}`:''}</small>
            </div></td>
            <td>${expiryHtml}</td>
            <td>${wBadge}</td>
            <td>
                <button class="btn-action btn-add" onclick="openModal('${item.code}','in')" title="Restock"><i class="fas fa-plus"></i></button>
                <button class="btn-action btn-sub" onclick="openModal('${item.code}','out')" title="Dispatch"><i class="fas fa-minus"></i></button>
                ${delBtn}
            </td></tr>`;
    }).join('');
}

function getStockStatusClass(item) {
    if (item.current_stock===0) return 'out';
    if (item.min_threshold>0 && item.current_stock<=item.min_threshold) return 'low';
    if (item.max_ceiling && item.current_stock>item.max_ceiling*ALERT_THRESHOLDS.OVERSTOCK_MULTIPLIER) return 'overstock';
    return 'available';
}
function getStockStatusText(item) {
    if (item.current_stock===0) return 'Stockout';
    if (item.min_threshold>0 && item.current_stock<=item.min_threshold) return 'Low Stock';
    if (item.max_ceiling && item.current_stock>item.max_ceiling*ALERT_THRESHOLDS.OVERSTOCK_MULTIPLIER) return 'Overstock';
    return 'Available';
}

function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ---- SEARCH & SORT (TC-24 to TC-30, TC-38/39) ----
function filterInventory(q) {
    if (!q.trim()) { renderInventoryTable(inventoryData); return; }
    const l = q.toLowerCase();
    renderInventoryTable(inventoryData.filter(i =>
        (i.code||'').toLowerCase().includes(l)||(i.name||'').toLowerCase().includes(l)||(i.vendor||'').toLowerCase().includes(l)));
}

function sortTable(key) {
    const dir = invSortState[key]==='asc'?'desc':'asc'; invSortState={[key]:dir};
    const sorted = [...inventoryData].sort((a,b)=>{
        const vA=typeof a[key]==='number'?a[key]:(a[key]||'').toLowerCase();
        const vB=typeof b[key]==='number'?b[key]:(b[key]||'').toLowerCase();
        return vA<vB?(dir==='asc'?-1:1):vA>vB?(dir==='asc'?1:-1):0;
    });
    renderInventoryTable(sorted);
}

// ---- TRANSACTION MODAL (TC-61 to TC-78) ----
function openModal(code, type) {
    const item = inventoryData.find(i=>i.code===code); if (!item) return;
    const available = item.current_stock - item.allocated_stock;
    document.getElementById('transModal').style.display='flex';
    document.getElementById('trans-code').value=code;
    document.getElementById('trans-type').value=type;
    const outLogic=document.getElementById('out-logic');
    const inLogic=document.getElementById('in-logic');
    const destInput=document.getElementById('trans-destination');
    const srcInput=document.getElementById('trans-source');
    const purposeInput=document.getElementById('trans-purpose');
    const qtyInput=document.getElementById('trans-qty');
    if (destInput) destInput.value=''; if (srcInput) srcInput.value='';
    if (purposeInput) purposeInput.value=''; if (qtyInput) qtyInput.value=1;
    document.getElementById('trans-title').textContent = type==='out'?`Dispatch: ${item.name}`:`Restock: ${item.name}`;
    document.getElementById('trans-subtitle').textContent = type==='out'
        ?`Available: ${available} (${item.current_stock} total / ${item.allocated_stock} reserved)`
        :`Current Stock: ${item.current_stock}`;
    if (outLogic) outLogic.style.display=type==='out'?'block':'none';
    if (inLogic)  inLogic.style.display=type==='out'?'none':'block';
}

function closeTransModal() { document.getElementById('transModal').style.display='none'; }

function setupTransactionForm() {
    const form=document.getElementById('trans-form'); if(!form) return;
    form.addEventListener('submit', async e=>{
        e.preventDefault();
        const btn=form.querySelector('[type="submit"]'); btn.disabled=true;
        try {
            const code=document.getElementById('trans-code').value;
            const type=document.getElementById('trans-type').value;
            const qty=parseInt(document.getElementById('trans-qty').value);
            const dest=(document.getElementById('trans-destination')?.value||'').trim();
            const src=(document.getElementById('trans-source')?.value||'').trim();
            const purpose=(document.getElementById('trans-purpose')?.value||'').trim();
            if (!qty||qty===0){showToast('Quantity must be greater than zero','error');return;}
            if (type==='in'&&!src){showToast('Source / Vendor is required for restocking','error');return;}
            const quantityChange=type==='out'?-Math.abs(qty):Math.abs(qty);
            const res=await fetch(`/api/inventory/${encodeURIComponent(code)}`,{
                method:'PUT',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({quantity_change:quantityChange,destination:type==='out'?dest:src,purpose})});
            const data=await res.json();
            if(!res.ok){
                let msg=data.error||'Transaction failed';
                if(data.details) msg+=` â€” Available: ${data.details.available}`;
                showToast(msg,'error'); return;
            }
            closeTransModal();
            showToast(type==='out'?'Dispatch completed âœ“':'Stock restocked successfully âœ“','success');
            await loadInventory();
        } catch(_){showToast('Network error','error');}
        finally{btn.disabled=false;}
    });
}

// ---- DELETE (TC-56/57/58) ----
async function deleteItem(code) {
    if (!confirm(`Delete item ${code}?\nThis cannot be undone.`)) return;
    try {
        const res=await fetch(`/api/inventory/${encodeURIComponent(code)}`,{method:'DELETE'});
        const data=await res.json();
        if(!res.ok){showToast(data.error||'Delete failed','error');return;}
        showToast(`Item ${code} permanently deleted`,'success');
        await loadInventory();
    } catch(_){showToast('Network error','error');}
}

// ---- ADD ITEM (TC-41 to TC-51) ----
function setupAddItemForm() {
    const form=document.getElementById('add-item-form'); if(!form) return;
    form.addEventListener('submit', async e=>{
        e.preventDefault();
        const btn=form.querySelector('[type="submit"]'); btn.disabled=true;
        try {
            const body={
                code:document.getElementById('add-code')?.value.trim(),
                name:document.getElementById('add-name')?.value.trim(),
                vendor:document.getElementById('add-vendor')?.value.trim()||null,
                current_stock:parseInt(document.getElementById('add-qty')?.value)||0,
                min_threshold:parseInt(document.getElementById('add-min')?.value)||0,
                max_ceiling:parseInt(document.getElementById('add-max')?.value)||null,
                warranty_start:document.getElementById('add-warranty-start')?.value||null,
                warranty_end:document.getElementById('add-warranty-end')?.value||null,
                delivery_date:document.getElementById('add-delivery')?.value||null
            };
            const res=await fetch('/api/inventory',{method:'POST',
                headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
            const data=await res.json();
            if(!res.ok){showToast(data.error||'Failed to add item','error');return;}
            showToast(`Item ${body.code} added successfully âœ“`,'success');
            form.reset();
            switchTab('inventory',document.querySelector('.nav-item[data-tab="inventory"]'));
            await loadInventory();
        } catch(_){showToast('Network error','error');}
        finally{btn.disabled=false;}
    });
}

// ---- HISTORY (TC-81 to TC-94) ----
async function loadHistory(page) {
    page=page||histPage||1;
    try {
        const res=await fetch(`/api/transactions?limit=50&page=${page}`);
        if(res.status===403){
            const l=document.getElementById('history-list');
            if(l) l.innerHTML='<tr><td colspan="6" class="empty-state">Admin access required</td></tr>';
            return;
        }
        const data=await res.json();
        historyData=data.transactions||[]; histTotalPages=data.pages||1; histPage=data.page||1;
        renderHistory(historyData); updatePaginationUI();
    } catch(_){showToast('Failed to load history','error');}
}

function loadHistoryPage(page){if(page>=1&&page<=histTotalPages) loadHistory(page);}

function renderHistory(data) {
    const list=document.getElementById('history-list'); if(!list) return;
    if(!data||!data.length){
        list.innerHTML='<tr><td colspan="6" class="empty-state">No transactions found</td></tr>'; return;
    }
    list.innerHTML=data.map(log=>{
        const cls=log.quantity_change>0?'text-green':'text-red';
        const sign=log.quantity_change>0?'+':'';
        const ts=log.timestamp?new Date(log.timestamp).toLocaleString():'N/A';
        return `<tr>
            <td>${ts}</td><td>${escHtml(log.actor_name)}</td>
            <td><small>${escHtml(log.inventory_code)}</small><br>${escHtml(log.item_name||'')}</td>
            <td class="${cls}">${sign}${log.quantity_change}</td>
            <td>${escHtml(log.destination||'â€”')}</td>
            <td><small>${escHtml(log.purpose||'â€”')}</small></td></tr>`;
    }).join('');
}

function filterHistory(q) {
    if(!q.trim()){renderHistory(historyData);return;}
    const l=q.toLowerCase();
    renderHistory(historyData.filter(t=>
        (t.actor_name||'').toLowerCase().includes(l)||(t.inventory_code||'').toLowerCase().includes(l)||
        (t.item_name||'').toLowerCase().includes(l)||(t.destination||'').toLowerCase().includes(l)||
        (t.purpose||'').toLowerCase().includes(l)));
}

function sortHistory(key) {
    const dir=histSortState[key]==='asc'?'desc':'asc'; histSortState={[key]:dir};
    const sorted=[...historyData].sort((a,b)=>{
        let vA=a[key],vB=b[key];
        if(key==='timestamp'){vA=new Date(vA);vB=new Date(vB);}
        else{vA=(vA||'').toLowerCase();vB=(vB||'').toLowerCase();}
        return vA<vB?(dir==='asc'?-1:1):vA>vB?(dir==='asc'?1:-1):0;
    });
    renderHistory(sorted);
}

function updatePaginationUI() {
    const i=document.getElementById('pag-info');
    const p=document.getElementById('pag-prev');
    const n=document.getElementById('pag-next');
    if(i) i.textContent=`Page ${histPage} of ${histTotalPages}`;
    if(p) p.disabled=histPage<=1; if(n) n.disabled=histPage>=histTotalPages;
}

function exportHistoryCSV() {
    const h=['Time','User','Item Code','Item Name','Change','Destination','Purpose'];
    const rows=historyData.map(t=>[
        new Date(t.timestamp).toLocaleString(),t.actor_name||'',t.inventory_code||'',
        t.item_name||'',t.quantity_change,t.destination||'',t.purpose||''
    ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
    const csv=[h.join(','),...rows].join('\r\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download=`stocksense_history_page${histPage}.csv`; a.click();
}

// ---- TAB NAVIGATION ----
function switchTab(tab, el) {
    document.querySelectorAll('.view-section').forEach(s=>s.style.display='none');
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    const v=document.getElementById('view-'+tab); if(v) v.style.display='block';
    if(el) el.classList.add('active');
    if(tab==='history') loadHistory(1);
    document.querySelector('.sidebar')?.classList.remove('sidebar-open');
}

function toggleSidebar(){document.querySelector('.sidebar')?.classList.toggle('sidebar-open');}

// ---- LOGOUT ----
function logout(){
    fetch('/api/logout',{method:'POST'}).catch(()=>{}).finally(()=>{window.location.href='index.html';});
}

// ---- THEME ----
function setupTheme() {
    const toggle=document.getElementById('checkbox'); if(!toggle) return;
    const saved=localStorage.getItem('theme')||'light';
    document.documentElement.setAttribute('data-theme',saved);
    if(saved==='dark') toggle.checked=true;
    toggle.addEventListener('change',e=>{
        const theme=e.target.checked?'dark':'light';
        document.documentElement.setAttribute('data-theme',theme);
        localStorage.setItem('theme',theme);
    });
}

// ---- TOAST (TC-75/76) ----
function showToast(message, type) {
    type=type||'success';
    let c=document.getElementById('toast-container');
    if(!c){c=document.createElement('div');c.id='toast-container';
        Object.assign(c.style,{position:'fixed',top:'20px',right:'20px',zIndex:'9999',display:'flex',flexDirection:'column',gap:'10px'});
        document.body.appendChild(c);}
    const t=document.createElement('div');
    t.innerHTML=`<i class="fas ${type==='success'?'fa-check-circle':'fa-exclamation-circle'}"></i> ${escHtml(message)}`;
    Object.assign(t.style,{background:type==='success'?'#28a745':'#dc3545',color:'white',padding:'12px 20px',
        borderRadius:'8px',display:'flex',alignItems:'center',gap:'10px',boxShadow:'0 4px 12px rgba(0,0,0,0.3)',
        fontSize:'0.9rem',maxWidth:'400px',cursor:'pointer'});
    t.onclick=()=>t.remove(); c.appendChild(t);
    setTimeout(()=>{t.style.transition='opacity 0.5s';t.style.opacity='0';setTimeout(()=>t.remove(),500);},3500);
}

// Legacy shim â€” old dashboard.html calls closeModal()
function closeModal(){closeTransModal();}

// ============================================================
// End of StockSense v2.0 frontend -- Supabase / API edition
// ============================================================
