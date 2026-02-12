// --- DATA INITIALIZATION ---
const defaultInventory = [
    { id: 1, code: "MCH-001", name: "Forklift", vendor: "Toyota", quantity: 5, safety: 5, warranty: "2030-01-01", image: "https://cdn-icons-png.flaticon.com/512/2821/2821867.png" },
    { id: 2, code: "MCH-002", name: "Pallet Jack", vendor: "Uline", quantity: 2, safety: 5, warranty: "2027-05-20", image: "https://cdn-icons-png.flaticon.com/512/3229/3229986.png" },
    { id: 3, code: "EQP-104", name: "Conveyor Belt", vendor: "Bosch", quantity: 4, safety: 5, warranty: "2028-11-15", image: "https://cdn-icons-png.flaticon.com/512/1541/1541484.png" },
    { id: 4, code: "STR-201", name: "Shelving Unit", vendor: "IKEA", quantity: 1, safety: 5, warranty: "2026-06-10", image: "https://cdn-icons-png.flaticon.com/512/3143/3143160.png" }
];

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

// 1. Render Tracker (Low Stock)
function renderTracker() {
    const grid = document.getElementById('tracker-grid');
    grid.innerHTML = '';
    const alerts = inventory.filter(i => i.quantity < i.safety);

    if (alerts.length === 0) {
        grid.innerHTML = '<p class="empty-state">All systems nominal. No stock alerts.</p>';
        return;
    }

    alerts.forEach(item => {
        grid.innerHTML += `
            <div class="stock-card red-alert">
                <div class="card-img" style="background-image: url('${item.image}')"></div>
                <div class="card-info">
                    <h4>${item.name}</h4>
                    <p class="warning-text">CRITICAL: ${item.quantity} Remaining</p>
                    <p class="vendor">Vendor: ${item.vendor}</p>
                </div>
            </div>
        `;
    });
}

// 2. Render Inventory Table
function renderInventory(data) {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';
    data.forEach(item => {
        const statusClass = item.quantity > 0 ? 'available' : 'out';
        const statusText = item.quantity > 0 ? 'Available' : 'Stockout';
        
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
                <td><span class="qty-display">${item.quantity}</span></td>
                <td>
                    <button class="btn-action btn-add" onclick="openModal(${item.id}, 'in')"><i class="fas fa-plus"></i></button>
                    <button class="btn-action btn-sub" onclick="openModal(${item.id}, 'out')"><i class="fas fa-minus"></i></button>
                </td>
            </tr>
        `;
    });
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
