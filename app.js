// ==================== Global ====================
let fullDataset = [];
let filteredData = [];
let currentDisplayData = [];
let ringChart = null;
let lineChart = null;
let currentTableSort = { column: 'date', order: 'desc' };
let currentTableSearch = '';

// DOM Elements
const startDateInput = document.getElementById('filterStartDate');
const endDateInput = document.getElementById('filterEndDate');
const filterDept = document.getElementById('filterDept');
const filterJenis = document.getElementById('filterJenis');
const filterStatus = document.getElementById('filterStatus');
const filterUser = document.getElementById('filterUser');
const resetBtn = document.getElementById('resetFilterBtn');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const tableSearchInput = document.getElementById('tableSearchInput');
const tableSortColumn = document.getElementById('tableSortColumn');
const tableSortOrder = document.getElementById('tableSortOrder');
const applySortBtn = document.getElementById('applySortBtn');

const CSV_FILE_PATH = 'dataorderatk.csv';

// ==================== Load CSV ====================
async function loadCSV(filePathOrFile) {
    try {
        let csvText;
        if (typeof filePathOrFile === 'string') {
            const res = await fetch(filePathOrFile);
            if (!res.ok) throw new Error('File tidak ditemukan');
            csvText = await res.text();
        } else {
            csvText = await filePathOrFile.text();
        }
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                fullDataset = results.data.filter(row => row['Order time'] && row['Name']);
                if (fullDataset.length === 0 && results.data.length) fullDataset = results.data;
                updateFilterOptions();
                applyFilters();
                document.getElementById('lastUpdate').innerHTML = `<i class="fas fa-check-circle"></i> ${new Date().toLocaleTimeString()}`;
            },
            error: (err) => { console.error(err); alert('Gagal parsing CSV'); }
        });
    } catch (error) {
        console.error(error);
        document.getElementById('tableBody').innerHTML = '<tr><td colspan="8">Gagal memuat data. Upload manual atau periksa file.</td></tr>';
    }
}

// ==================== Update Dropdown ====================
function updateFilterOptions() {
    const deptSet = new Set();
    const jenisSet = new Set();
    const userSet = new Set();
    fullDataset.forEach(row => {
        let dept = row['Area Department']?.trim() || 'Unknown';
        let jenis = row['JENIS APD']?.trim() || 'Lainnya';
        let user = row['Name']?.trim() || 'Anonim';
        if (dept) deptSet.add(dept);
        if (jenis) jenisSet.add(jenis);
        if (user) userSet.add(user);
    });
    filterDept.innerHTML = '<option value="all">Semua Departemen</option>';
    [...deptSet].sort().forEach(d => { filterDept.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`; });
    filterJenis.innerHTML = '<option value="all">Semua Jenis APD</option>';
    [...jenisSet].sort().forEach(j => { filterJenis.innerHTML += `<option value="${escapeHtml(j)}">${escapeHtml(j)}</option>`; });
    filterUser.innerHTML = '<option value="all">Semua User</option>';
    [...userSet].sort().forEach(u => { filterUser.innerHTML += `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`; });
}

// ==================== Filter Data Utama ====================
function applyFilters() {
    if (!fullDataset.length) return;
    const startDate = startDateInput.value ? new Date(startDateInput.value) : null;
    const endDate = endDateInput.value ? new Date(endDateInput.value) : null;
    const deptVal = filterDept.value;
    const jenisVal = filterJenis.value;
    const statusVal = filterStatus.value;
    const userVal = filterUser.value;

    filteredData = fullDataset.filter(row => {
        const orderDateStr = row['Order time'] || '';
        const [day, month, year] = orderDateStr.split('/');
        if (day && month && year) {
            const rowDate = new Date(`${year}-${month}-${day}`);
            if (startDate && rowDate < startDate) return false;
            if (endDate && rowDate > endDate) return false;
        }
        const deptRow = (row['Area Department'] || '').trim();
        if (deptVal !== 'all' && deptRow !== deptVal) return false;
        const jenisRow = (row['JENIS APD'] || '').trim();
        if (jenisVal !== 'all' && jenisRow !== jenisVal) return false;
        const statusRow = (row['Status'] || '').trim();
        if (statusVal !== 'all' && statusRow !== statusVal) return false;
        const userRow = (row['Name'] || '').trim();
        if (userVal !== 'all' && userRow !== userVal) return false;
        return true;
    });
    updateKPI();
    updateOvalBarChart();
    updateLineChart();
    updateRingChart();
    updateTopUserDetail();
    applyTableFilterAndSort();
}

// ==================== KPI ====================
function updateKPI() {
    const totalOrders = filteredData.length;
    let totalQty = 0;
    const userSet = new Set();
    const deptSet = new Set();
    let completedCount = 0;
    filteredData.forEach(row => {
        totalQty += parseInt(row['Qty']) || 0;
        if (row['Name']) userSet.add(row['Name'].trim());
        if (row['Area Department']) deptSet.add(row['Area Department'].trim());
        if ((row['Status'] || '').toLowerCase() === 'completed') completedCount++;
    });
    document.getElementById('totalOrders').innerText = totalOrders;
    document.getElementById('totalQty').innerText = totalQty;
    document.getElementById('uniqueUsers').innerText = userSet.size;
    document.getElementById('deptCount').innerText = deptSet.size;
    document.getElementById('completedCount').innerText = completedCount;
}

// ==================== Oval Bar Chart (Item terbanyak) + Klik Pop-up ====================
function updateOvalBarChart() {
    const itemMap = new Map();
    filteredData.forEach(row => {
        let item = row['Detail'] || row['JENIS APD'] || 'Unknown';
        let qty = parseInt(row['Qty']) || 0;
        itemMap.set(item, (itemMap.get(item) || 0) + qty);
    });
    const sorted = [...itemMap.entries()].sort((a,b) => b[1] - a[1]).slice(0, 6);
    const maxQty = sorted[0]?.[1] || 1;
    const container = document.getElementById('ovalBarList');
    if (!sorted.length) { container.innerHTML = '<div>Tidak ada data</div>'; return; }
    container.innerHTML = sorted.map(([item, qty]) => {
        const percent = (qty / maxQty) * 100;
        return `<div class="oval-bar-item" onclick="showPopupByItem('${escapeHtml(item)}')">
            <span class="oval-bar-label" title="${escapeHtml(item)}">${escapeHtml(item.length > 28 ? item.slice(0,25)+'..' : item)}</span>
            <div class="oval-bar-track"><div class="oval-bar-fill" style="width: ${percent}%;">${qty}</div></div>
        </div>`;
    }).join('');
}

function showPopupByItem(itemName) {
    const orders = filteredData.filter(row => (row['Detail'] || row['JENIS APD'] || '') === itemName);
    if (!orders.length) return;
    let html = `<h4>📦 Order untuk: ${escapeHtml(itemName)}</h4><table class="modal-table"><tr><th>Tanggal</th><th>Nama</th><th>Dept</th><th>Qty</th><th>Status</th></tr>`;
    orders.forEach(o => {
        html += `<tr><td>${escapeHtml(o['Order time'] || '-')}</td><td>${escapeHtml(o['Name'] || '-')}</td><td>${escapeHtml(o['Area Department'] || '-')}</td><td>${o['Qty']}</td><td>${escapeHtml(o['Status'] || '-')}</td></tr>`;
    });
    html += `</table><p><strong>Total Qty: ${orders.reduce((s,o)=>s+(parseInt(o['Qty'])||0),0)}</strong></p>`;
    document.getElementById('modalTitle').innerHTML = '📦 Detail Item';
    document.getElementById('modalDetailContainer').innerHTML = html;
    document.getElementById('detailModal').style.display = 'flex';
}

// ==================== Line Chart ====================
function updateLineChart() {
    const monthMap = new Map();
    filteredData.forEach(row => {
        const dateStr = row['Order time'] || '';
        const [day, month, year] = dateStr.split('/');
        if (day && month && year) {
            const key = `${year}-${month}`;
            const qty = parseInt(row['Qty']) || 0;
            monthMap.set(key, (monthMap.get(key) || 0) + qty);
        }
    });
    const sortedMonths = [...monthMap.keys()].sort();
    const labels = sortedMonths.map(m => m.substring(5) + '/' + m.substring(2,4));
    const data = sortedMonths.map(m => monthMap.get(m));
    const ctx = document.getElementById('lineChart').getContext('2d');
    if (lineChart) lineChart.destroy();
    lineChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Total Qty', data, borderColor: '#2c7da0', backgroundColor: 'rgba(44,125,160,0.05)', tension: 0.3, fill: true, pointBackgroundColor: '#5fa7c5', pointRadius: 4, borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
    });
}

// ==================== Ring Chart + Klik Pop-up ====================
function updateRingChart() {
    const userQty = new Map();
    filteredData.forEach(row => {
        let name = row['Name']?.trim() || 'Anonim';
        let qty = parseInt(row['Qty']) || 0;
        userQty.set(name, (userQty.get(name) || 0) + qty);
    });
    const sorted = [...userQty.entries()].sort((a,b) => b[1] - a[1]).slice(0, 8);
    const labels = sorted.map(s => s[0].length > 12 ? s[0].slice(0,10)+'..' : s[0]);
    const fullNames = sorted.map(s => s[0]);
    const data = sorted.map(s => s[1]);
    const others = [...userQty.entries()].slice(8).reduce((sum,item) => sum + item[1], 0);
    if (others > 0) { labels.push('Lainnya'); data.push(others); fullNames.push(null); }
    const ctx = document.getElementById('ringChart').getContext('2d');
    if (ringChart) ringChart.destroy();
    ringChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: ['#2C7DA0','#3B9BCB','#61A5C2','#89C2D9','#A9D6E5','#D4EAF2','#E9C46A','#E76F51','#B0D9D1'], borderWidth: 0, cutout: '65%' }] },
        options: { 
            responsive: true, 
            maintainAspectRatio: true, 
            onClick: (e, active) => { 
                if(active.length) { 
                    const index = active[0].dataIndex; 
                    const userName = fullNames[index];
                    if(userName) showPopupByUser(userName);
                } 
            }
        }
    });
}

function showPopupByUser(userName) {
    const orders = filteredData.filter(row => (row['Name'] || '').trim() === userName);
    if (!orders.length) return;
    let html = `<h4>👤 Order dari: ${escapeHtml(userName)}</h4><table class="modal-table"><tr><th>Tanggal</th><th>Departemen</th><th>Item</th><th>Qty</th><th>Status</th></tr>`;
    orders.forEach(o => {
        html += `<tr><td>${escapeHtml(o['Order time'] || '-')}</td><td>${escapeHtml(o['Area Department'] || '-')}</td><td>${escapeHtml(o['Detail'] || o['JENIS APD'] || '-')}</td><td>${o['Qty']}</td><td>${escapeHtml(o['Status'] || '-')}</td></tr>`;
    });
    html += `</table><p><strong>Total Order: ${orders.length} | Total Qty: ${orders.reduce((s,o)=>s+(parseInt(o['Qty'])||0),0)}</strong></p>`;
    document.getElementById('modalTitle').innerHTML = '👤 Detail User';
    document.getElementById('modalDetailContainer').innerHTML = html;
    document.getElementById('detailModal').style.display = 'flex';
}

// ==================== Top User dengan Tabel ====================
function updateTopUserDetail(selectedUserName = null) {
    const userMap = new Map();
    filteredData.forEach(row => {
        let name = row['Name']?.trim() || 'Anonim';
        let qty = parseInt(row['Qty']) || 0;
        if (!userMap.has(name)) userMap.set(name, { totalQty: 0, orders: [] });
        let userData = userMap.get(name);
        userData.totalQty += qty;
        userData.orders.push(row);
    });
    const sortedUsers = [...userMap.entries()].map(([name, data]) => ({ name, totalQty: data.totalQty, orders: data.orders }))
        .sort((a,b) => b.totalQty - a.totalQty).slice(0, 5);
    if (!selectedUserName && sortedUsers.length) selectedUserName = sortedUsers[0].name;
    if (!selectedUserName) { document.getElementById('topUserDetailedContainer').innerHTML = '<div>Tidak ada data</div>'; return; }
    
    const selectedUser = sortedUsers.find(u => u.name === selectedUserName);
    if (!selectedUser) { document.getElementById('topUserDetailedContainer').innerHTML = '<div>Pilih user</div>'; return; }
    
    // Hitung detail item per user
    const itemMap = new Map();
    selectedUser.orders.forEach(order => {
        let item = order['Detail'] || order['JENIS APD'] || 'Unknown';
        let qty = parseInt(order['Qty']) || 0;
        itemMap.set(item, (itemMap.get(item) || 0) + qty);
    });
    
    let html = `<div style="background:#eef3f9; border-radius:20px; padding:16px;">
        <h4><i class="fas fa-user"></i> ${escapeHtml(selectedUser.name)}</h4>
        <p><strong>Total Order: ${selectedUser.orders.length} | Total Qty: ${selectedUser.totalQty} pcs</strong></p>
        <table class="detail-item-table" style="width:100%; margin-top:12px;">
            <tr style="background:#e2eaf1;"><th>Item APD</th><th>Total Qty</th><th>Aksi</th></tr>`;
    for (let [item, qty] of itemMap) {
        html += `<tr><td>${escapeHtml(item)}</td><td>${qty}</td><td><button class="btn-detail" onclick="showPopupByItem('${escapeHtml(item)}')">Lihat Order</button></td></tr>`;
    }
    html += `</table><button class="btn-detail" onclick="showPopupByUser('${escapeHtml(selectedUser.name)}')" style="margin-top:12px;">📋 Lihat Semua Order User Ini</button></div>`;
    document.getElementById('topUserDetailedContainer').innerHTML = html;
}

// ==================== Filter & Sort Tabel ====================
function applyTableFilterAndSort() {
    let data = [...filteredData];
    if (currentTableSearch) {
        const searchLower = currentTableSearch.toLowerCase();
        data = data.filter(row => 
            (row['Name'] || '').toLowerCase().includes(searchLower) ||
            (row['Area Department'] || '').toLowerCase().includes(searchLower) ||
            (row['JENIS APD'] || '').toLowerCase().includes(searchLower) ||
            (row['Detail'] || '').toLowerCase().includes(searchLower)
        );
    }
    // Sorting
    const column = currentTableSort.column;
    const order = currentTableSort.order;
    data.sort((a,b) => {
        let valA, valB;
        switch(column) {
            case 'date':
                const dateA = a['Order time']?.split('/').reverse().join('-') || '';
                const dateB = b['Order time']?.split('/').reverse().join('-') || '';
                valA = dateA; valB = dateB; break;
            case 'name': valA = a['Name'] || ''; valB = b['Name'] || ''; break;
            case 'dept': valA = a['Area Department'] || ''; valB = b['Area Department'] || ''; break;
            case 'jenis': valA = a['JENIS APD'] || ''; valB = b['JENIS APD'] || ''; break;
            case 'qty': valA = parseInt(a['Qty']) || 0; valB = parseInt(b['Qty']) || 0; break;
            case 'status': valA = a['Status'] || ''; valB = b['Status'] || ''; break;
            default: valA = a['Order time'] || ''; valB = b['Order time'] || '';
        }
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });
    currentDisplayData = data;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!currentDisplayData.length) { tbody.innerHTML = '<tr><td colspan="8">Tidak ada data sesuai filter</td></tr>'; return; }
    let html = '';
    currentDisplayData.forEach((row, idx) => {
        html += `<tr>
            <td>${escapeHtml(row['Order time'] || '-')}</td>
            <td>${escapeHtml(row['Name'] || '-')}</td>
            <td>${escapeHtml(row['Area Department'] || '-')}</td>
            <td>${escapeHtml(row['JENIS APD'] || '-')}</td>
            <td>${escapeHtml(row['Detail'] || '-')}</td>
            <td>${escapeHtml(row['Qty'] || '0')}</td>
            <td><span style="background:#e0f0e8; padding:4px 10px; border-radius:30px;">${escapeHtml(row['Status'] || '-')}</span></td>
            <td><button class="btn-detail" data-index="${idx}"><i class="fas fa-eye"></i> Detail</button></td>
        </tr>`;
    });
    tbody.innerHTML = html;
    document.querySelectorAll('.btn-detail').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.getAttribute('data-index'));
            if (!isNaN(idx) && currentDisplayData[idx]) showModalDetail(currentDisplayData[idx]);
        });
    });
}

function showModalDetail(order) {
    const container = document.getElementById('modalDetailContainer');
    const fields = ['Order time','Name','Area Department','Remarks / Untuk Kebutuhan?','JENIS APD','Detail','Qty','Uom','HMS/Contracted','Source','Req Via','Status'];
    let html = '<div style="display:grid; gap:10px;">';
    fields.forEach(f => { if(order[f]) html += `<div><strong>${f}:</strong><br/>${escapeHtml(order[f].toString())}</div>`; });
    html += '</div>';
    document.getElementById('modalTitle').innerHTML = '📋 Detail Order';
    document.getElementById('modalDetailContainer').innerHTML = html;
    document.getElementById('detailModal').style.display = 'flex';
}

// ==================== Sorting via Header Klik ====================
function setupSortableHeaders() {
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-column');
            const newOrder = (currentTableSort.column === column && currentTableSort.order === 'asc') ? 'desc' : 'asc';
            currentTableSort = { column, order: newOrder };
            tableSortColumn.value = column;
            tableSortOrder.value = newOrder;
            applyTableFilterAndSort();
        });
    });
}

// ==================== Reset & Upload ====================
function resetFilters() {
    startDateInput.value = '';
    endDateInput.value = '';
    filterDept.value = 'all';
    filterJenis.value = 'all';
    filterStatus.value = 'all';
    filterUser.value = 'all';
    currentTableSearch = '';
    tableSearchInput.value = '';
    currentTableSort = { column: 'date', order: 'desc' };
    tableSortColumn.value = 'date';
    tableSortOrder.value = 'desc';
    applyFilters();
}

function handleFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        Papa.parse(e.target.result, { header: true, skipEmptyLines: true, complete: (res) => {
            fullDataset = res.data.filter(r => r['Order time'] || r['Name']);
            updateFilterOptions();
            applyFilters();
            document.getElementById('lastUpdate').innerHTML = `<i class="fas fa-cloud-upload-alt"></i> CSV: ${new Date().toLocaleTimeString()}`;
        }});
    };
    reader.readAsText(file);
}

function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }

// ==================== Event Listeners ====================
startDateInput.addEventListener('change', applyFilters);
endDateInput.addEventListener('change', applyFilters);
filterDept.addEventListener('change', applyFilters);
filterJenis.addEventListener('change', applyFilters);
filterStatus.addEventListener('change', applyFilters);
filterUser.addEventListener('change', (e) => { applyFilters(); if(filterUser.value !== 'all') updateTopUserDetail(filterUser.value); else updateTopUserDetail(); });
resetBtn.addEventListener('click', resetFilters);
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { if(e.target.files[0]) handleFileUpload(e.target.files[0]); });
tableSearchInput.addEventListener('input', (e) => { currentTableSearch = e.target.value; applyTableFilterAndSort(); });
applySortBtn.addEventListener('click', () => {
    currentTableSort = { column: tableSortColumn.value, order: tableSortOrder.value };
    applyTableFilterAndSort();
});

document.querySelector('.close-modal')?.addEventListener('click', () => document.getElementById('detailModal').style.display = 'none');
window.addEventListener('click', (e) => { if(e.target === document.getElementById('detailModal')) document.getElementById('detailModal').style.display = 'none'; });

window.showPopupByUser = showPopupByUser;
window.showPopupByItem = showPopupByItem;

// ==================== Init ====================
loadCSV(CSV_FILE_PATH);
setTimeout(() => setupSortableHeaders(), 500);