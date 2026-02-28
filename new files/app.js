// --- DEFAULT MOCK DATA (For UI Testing) ---
let inventory = [
    { id: 1, code: "SKU-101", name: "Industrial Motor", desc: "6.01 mg pwctt", vendor: "Siemens", delivery: "2025-01-10", available: 52, allocated: 30, ceiling: 100, safety: 10, warranty: "2024-01-01" },
    { id: 2, code: "SKU-205", name: "Hydraulic Pump", desc: "60rt very", vendor: "Parker", delivery: "2025-05-20", available: 180, allocated: 120, ceiling: 300, safety: 50, warranty: "2026-12-01" },
    { id: 3, code: "SKU-308", name: "Conveyor Belt", desc: "10.0 2025", vendor: "ConveyorPro", available: 400, allocated: 100, ceiling: 600, safety: 100, warranty: "2027-05-20" }
];

document.addEventListener('DOMContentLoaded', () => {
    if (!sessionStorage.getItem("stocksense_logged_in")) window.location.href = "index.html";
    setupTheme();
    renderAll();
});

function renderAll() {
    renderInventoryTable(inventory);
    // Add other render calls here (Metrics, Alerts)
}

// --- MERGED: Sorting Logic ---
function sortTable(key) {
    // Show spinner
    document.getElementById('loading-spinner').style.display = 'flex';
    
    setTimeout(() => {
        inventory.sort((a, b) => {
            let valA = a[key];
            let valB = b[key];
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            return valA > valB ? 1 : -1;
        });
        renderInventoryTable(inventory);
        document.getElementById('loading-spinner').style.display = 'none';
    }, 300); // Fake delay for realism
}

function renderInventoryTable(data) {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';
    
    data.forEach(item => {
        // Warranty & Badge Logic (Same as before)
        const today = new Date();
        const wDate = new Date(item.warranty);
        let wBadge = wDate < today ? '<span class="badge badge-red">Expired</span>' : '<span class="badge badge-green">Active</span>';
        
        list.innerHTML += `
            <tr>
                <td class="font-bold text-dark">${item.code}</td>
                <td><div class="desc-title">${item.name}</div><div class="desc-sub">${item.desc}</div></td>
                <td class="text-muted">${item.vendor}</td>
                <td class="font-bold">${item.available}</td>
                <td><span class="badge badge-gray">${item.allocated} MA</span></td>
                <td class="text-muted">${item.ceiling}</td>
                <td>${wBadge}</td>
                <td>
                    <button class="btn-icon text-green" onclick="openModal(${item.id}, 'in')"><i class="fas fa-plus-circle"></i></button>
                    <button class="btn-icon text-red" onclick="openModal(${item.id}, 'out')"><i class="fas fa-minus-circle"></i></button>
                </td>
            </tr>
        `;
    });
}

// --- Modal & Theme Logic ---
function openModal(id, type) {
    const item = inventory.find(i => i.id === id);
    if(!item) return;
    document.getElementById('transModal').style.display = 'flex';
    document.getElementById('trans-id').value = id;
    document.getElementById('trans-type').value = type;
    document.getElementById('trans-qty').value = 1;
    
    const title = document.getElementById('trans-title');
    const outLogic = document.getElementById('out-logic');

    if (type === 'in') {
        title.innerText = "Restock Item: " + item.code;
        outLogic.style.display = 'none';
    } else {
        title.innerText = "Dispatch Item: " + item.code;
        outLogic.style.display = 'block';
    }
}

function closeTransModal() {
    document.getElementById('transModal').style.display = 'none';
}

function setupTheme() {
    const toggle = document.getElementById('theme-toggle');
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

function logout() {
    sessionStorage.removeItem("stocksense_logged_in");
    window.location.href = "index.html";
}

function switchTab(tab, el) {
    document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-' + tab).style.display = 'block';
    el.classList.add('active');
}