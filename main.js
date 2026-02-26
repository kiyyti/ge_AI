// ==========================================
// 1. ตั้งค่า API และตัวแปรเก็บข้อมูล
// ==========================================
const YOUR_MAKE_WEBHOOK_URL = 'https://kitt-jeamanukunkit.app.n8n.cloud/webhook/add-expense';        
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbyXDrCE1dcUznVcit1h4gRLIv6E-xz8Apj8blMNTGE6Ynb5MWsP1eOkP0R6apGxzfcS/exec';

let allData = []; // เก็บข้อมูลทั้งหมดจาก Sheets
let myDoughnutChart;
let myBarChart;
const chartColors = ['#ff0844', '#00f2fe', '#9b51e0', '#f59e0b', '#10b981', '#3b82f6', '#ec4899'];

// ==========================================
// 2. ฟังก์ชันหลัก: ดึงข้อมูลและอัปเดตทุกหน้า
// ==========================================
async function fetchAndRenderData() {
    try {
        // แสดงสถานะกำลังโหลดที่แดชบอร์ด
        document.querySelector('.balance-amount').innerHTML = 'กำลังโหลด...';
        
        const response = await fetch(GOOGLE_SHEET_API_URL, {
            method: "GET",
            redirect: "follow"
        });                
        const rawData = await response.json();
        // กรองเอาเฉพาะข้อมูลที่มีจำนวนเงิน และแปลงวันที่ให้ใช้งานได้
        allData = rawData.filter(item => {
            const typeValue = item['Type'] || item['Type ']; 
            const amountValue = item['Amount'] || item['Amount '];
            
            return amountValue && (typeValue === 'Expense' || typeValue === 'รายจ่าย');
        }).map(item => {
            const typeValue = item['Type'] || item['Type '];
            const amountValue = item['Amount'] || item['Amount '];
            return {
                ...item,
                Type: typeValue, // บังคับให้ชื่อ Type สะอาด
                Amount: parseFloat(amountValue),
                DateObj: new Date(item.Date)
            };
        });
        
        // เรียงลำดับจากใหม่ไปเก่า
        allData.sort((a, b) => b.DateObj - a.DateObj);

        // เรียกใช้อัปเดต UI ทั้ง 3 หน้า
        renderDashboard();
        renderTransactions();
        renderReports();

    } catch (error) {
        console.error("Error loading data:", error);
        document.querySelector('.balance-amount').innerHTML = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
    }
}

// ==========================================
// 3. ฟังก์ชันเรนเดอร์: หน้าแดชบอร์ด
// ==========================================
function renderDashboard() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let currentMonthTotal = 0;
    let lastMonthTotal = 0;
    let categoryTotals = {};
    
    allData.forEach(item => {
        const itemMonth = item.DateObj.getMonth();
        const itemYear = item.DateObj.getFullYear();
        
        // คำนวณยอดเดือนนี้
        if (itemMonth === currentMonth && itemYear === currentYear) {
            currentMonthTotal += item.Amount;
            const cat = item.Category || 'อื่นๆ';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + item.Amount;
        }
        // คำนวณยอดเดือนที่แล้ว (สำหรับหา MoM Trend)
        let lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        let yearOfLastMonth = currentMonth === 0 ? currentYear - 1 : currentYear;
        if (itemMonth === lastMonth && itemYear === yearOfLastMonth) {
            lastMonthTotal += item.Amount;
        }
    });

    // อัปเดตตัวเลขยอดคงเหลือ
    document.querySelector('.balance-amount').innerHTML = 
        `${currentMonthTotal.toLocaleString()} <span style="font-size: 1.5rem; color: var(--text-muted);">THB</span>`;

    // อัปเดต % เปรียบเทียบเดือนที่แล้ว
    const trendEl = document.querySelector('.balance-trend');
    if (lastMonthTotal === 0) {
        trendEl.innerHTML = `<i class="ph-fill ph-minus"></i> ไม่มีข้อมูลเดือนที่แล้ว`;
        trendEl.style.color = "var(--text-muted)";
    } else {
        const percentChange = ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
        if (percentChange > 0) {
            trendEl.innerHTML = `<i class="ph-fill ph-trend-up"></i> เพิ่มขึ้น ${percentChange.toFixed(1)}% จากเดือนที่แล้ว`;
            trendEl.style.color = "var(--accent-pink)"; 
        } else {
            trendEl.innerHTML = `<i class="ph-fill ph-trend-down"></i> ลดลง ${Math.abs(percentChange).toFixed(1)}% จากเดือนที่แล้ว`;
            trendEl.style.color = "#4ade80"; 
        }
    }

    // อัปเดตกราฟโดนัท
    if (myDoughnutChart) {
        myDoughnutChart.data.labels = Object.keys(categoryTotals);
        myDoughnutChart.data.datasets[0].data = Object.values(categoryTotals);
        myDoughnutChart.update();
    }

    // อัปเดตรายการล่าสุด 3 รายการ
    const txContainer = document.querySelector('.transactions-card .transaction-list');
    txContainer.innerHTML = ''; 
    const recentTx = allData.slice(0, 3);
    
    recentTx.forEach(item => {
        const { iconClass, iconName } = getIconForCategory(item.Category);
        const dateStr = isNaN(item.DateObj) ? item.Date : item.DateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

        txContainer.innerHTML += `
            <div class="transaction-item">
                <div class="tx-left">
                    <div class="tx-icon ${iconClass}"><i class="ph ${iconName}"></i></div>
                    <div class="tx-details">
                        <span class="tx-title">${item.Description || '-'}</span>
                        <span class="tx-category">${item.Category} • ${dateStr}</span>
                    </div>
                </div>
                <div class="tx-amount">- ${item.Amount.toLocaleString()} THB</div>
            </div>
        `;
    });
}

// ==========================================
// 4. ฟังก์ชันเรนเดอร์: หน้ารายการธุรกรรม (พร้อม Filter)
// ==========================================
function renderTransactions() {
    // ดึงค่าจากตัวกรอง
    const searchInput = document.querySelector('#view-transactions .filter-input').value.toLowerCase();
    const categoryFilter = document.querySelectorAll('#view-transactions .filter-select')[0].value;
    const timeFilter = document.querySelectorAll('#view-transactions .filter-select')[1].value;

    const now = new Date();
    
    // กรองข้อมูล
    let filteredData = allData.filter(item => {
        // ป้องกัน Error กรณีที่ Description หรือ Category เป็นค่าว่าง (null/undefined)
        const itemDesc = (item.Description || '').toLowerCase();
        const itemCat = (item.Category || '').toLowerCase();

        // 1. กรองคำค้นหา
        const matchSearch = itemDesc.includes(searchInput) || itemCat.includes(searchInput);
        
        // 2. กรองหมวดหมู่ (รองรับทั้งภาษาอังกฤษที่ AI สร้าง และภาษาไทย)
        const matchCategory = categoryFilter === 'all' || 
                              (categoryFilter === 'food' && (itemCat.includes('food') || itemCat.includes('อาหาร'))) ||
                              (categoryFilter === 'transport' && (itemCat.includes('transport') || itemCat.includes('เดินทาง'))) ||
                              (categoryFilter === 'utility' && (itemCat.includes('utility') || itemCat.includes('สาธารณูปโภค'))) ||
                              (categoryFilter === 'entertainment' && (itemCat.includes('entertainment') || itemCat.includes('บันเทิง'))) ||
                              (categoryFilter === 'health' && (itemCat.includes('health') || itemCat.includes('รักษา') || itemCat.includes('สุขภาพ'))) ||
                              (categoryFilter === 'shopping' && (itemCat.includes('shopping') || itemCat.includes('ช็อปปิ้ง') || itemCat.includes('ช้อปปิ้ง')));
        
        // 3. กรองเวลา
        let matchTime = true;
        if (timeFilter === 'month') {
            matchTime = item.DateObj.getMonth() === now.getMonth() && item.DateObj.getFullYear() === now.getFullYear();
        } else if (timeFilter === 'last-month') {
            let lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            let lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            matchTime = item.DateObj.getMonth() === lastMonth && item.DateObj.getFullYear() === lastYear;
        } else if (timeFilter === 'year') {
            matchTime = item.DateObj.getFullYear() === now.getFullYear();
        }

        return matchSearch && matchCategory && matchTime;
    });

    const listContainer = document.querySelector('.full-transaction-list');
    listContainer.innerHTML = `
        <div class="table-header">
            <div>รายการ</div><div>หมวดหมู่</div><div>วันที่ / เวลา</div><div style="text-align: right;">จำนวนเงิน</div>
        </div>
    `;

    if (filteredData.length === 0) {
        listContainer.innerHTML += `<div style="padding: 20px; text-align: center; color: var(--text-muted);">ไม่พบรายการที่ตรงกับเงื่อนไข</div>`;
        return;
    }

    filteredData.forEach(item => {
        const { iconClass, iconName } = getIconForCategory(item.Category);
        const dateStr = isNaN(item.DateObj) ? item.Date : item.DateObj.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });

        listContainer.innerHTML += `
            <div class="table-row">
                <div class="tx-left">
                    <div class="tx-icon ${iconClass}"><i class="ph ${iconName}"></i></div>
                    <div class="tx-details"><span class="tx-title">${item.Description || '-'}</span></div>
                </div>
                <div style="color: var(--text-muted); font-size: 0.9rem;">${item.Category || 'อื่นๆ'}</div>
                <div style="color: var(--text-muted); font-size: 0.9rem;">${dateStr}</div>
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 16px;">
                    <span class="tx-amount">- ${item.Amount.toLocaleString()} THB</span>
                </div>
            </div>
        `;
    });
}

// ==========================================
// 5. ฟังก์ชันเรนเดอร์: หน้ารายงานสรุป
// ==========================================
function renderReports() {
    const yearSelect = document.querySelector('#view-reports .filter-select').value;
    const targetYear = parseInt(yearSelect);

    let monthlyTotals = new Array(12).fill(0);
    let categoryTotals = {};
    let yearTotal = 0;
    let maxTransaction = { Description: '-', Amount: 0 };

    allData.forEach(item => {
        if (item.DateObj.getFullYear() === targetYear) {
            monthlyTotals[item.DateObj.getMonth()] += item.Amount;
            
            const cat = item.Category || 'อื่นๆ';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + item.Amount;
            
            yearTotal += item.Amount;

            if (item.Amount > maxTransaction.Amount) {
                maxTransaction = item;
            }
        }
    });

    if (myBarChart) {
        myBarChart.data.datasets[0].data = monthlyTotals;
        myBarChart.update();
    }

    const topCategories = Object.entries(categoryTotals)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 3); 
    
    const topCatContainer = document.querySelectorAll('.report-half .transaction-list')[0];
    topCatContainer.innerHTML = '';
    
    if (topCategories.length === 0) {
        topCatContainer.innerHTML = `<div style="color: var(--text-muted);">ไม่มีข้อมูลในปี ${targetYear}</div>`;
    } else {
        topCategories.forEach(cat => {
            const percent = ((cat[1] / yearTotal) * 100).toFixed(0);
            const { iconClass, iconName } = getIconForCategory(cat[0]);
            
            topCatContainer.innerHTML += `
                <div class="transaction-item">
                    <div class="tx-left">
                        <div class="tx-icon ${iconClass}"><i class="ph ${iconName}"></i></div>
                        <div class="tx-details">
                            <span class="tx-title">${cat[0]}</span>
                            <span class="tx-category">${percent}% ของยอดรวม</span>
                        </div>
                    </div>
                    <div class="tx-amount">${cat[1].toLocaleString()} THB</div>
                </div>
            `;
        });
    }

    const statsContainer = document.querySelectorAll('.report-half')[1].querySelector('div[style*="display: flex;"]');
    
    const now = new Date();
    let daysInYear = targetYear === now.getFullYear() ? 
                     Math.ceil((now - new Date(targetYear, 0, 1)) / (1000 * 60 * 60 * 24)) : 365;
    if(daysInYear === 0) daysInYear = 1;
    const avgPerDay = (yearTotal / daysInYear).toFixed(0);

    statsContainer.innerHTML = `
        <div>
            <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 6px;">ยอดใช้จ่ายรวมปี ${targetYear}</div>
            <div style="font-size: 1.8rem; font-weight: 600; color: var(--text-main);">${yearTotal.toLocaleString()} THB</div>
        </div>
        <div>
            <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 6px;">ยอดใช้จ่ายเฉลี่ยต่อวัน</div>
            <div style="font-size: 1.4rem; font-weight: 600; color: var(--accent-cyan);">${parseInt(avgPerDay).toLocaleString()} THB</div>
        </div>
        <div>
            <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 6px;">ธุรกรรมที่มีมูลค่าสูงสุดในปีนี้</div>
            <div style="font-size: 1.1rem; font-weight: 500; color: var(--text-main);">
                ${maxTransaction.Description} (${maxTransaction.Amount.toLocaleString()} THB)
            </div>
        </div>
    `;
}

// Helper Function: เลือกไอคอนตามหมวดหมู่
function getIconForCategory(category) {
    let iconClass = 'icon-utility';
    let iconName = 'ph-receipt';
    if (!category) return { iconClass, iconName };
    
    if (category.includes('อาหาร') || category.includes('Food')) { iconClass = 'icon-food'; iconName = 'ph-hamburger'; }
    else if (category.includes('เดินทาง') || category.includes('Transport')) { iconClass = 'icon-transport'; iconName = 'ph-train'; }
    else if (category.includes('สาธารณูปโภค') || category.includes('Utility')) { iconClass = 'icon-utility'; iconName = 'ph-lightning'; }
    return { iconClass, iconName };
}

// ==========================================
// 6. การทำงานเมื่อเปิดเว็บ & การสร้างกราฟ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const currentYear = new Date().getFullYear();
    const yearSelect = document.querySelector('#view-reports .filter-select');
    yearSelect.innerHTML = `<option value="${currentYear}">ปี ${currentYear}</option><option value="${currentYear - 1}">ปี ${currentYear - 1}</option>`;

    const ctxDoughnut = document.getElementById('expenseChart').getContext('2d');
    myDoughnutChart = new Chart(ctxDoughnut, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: chartColors, borderWidth: 0 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '78%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: "'Prompt', sans-serif", size: 13 }, usePointStyle: true } },
                tooltip: { callbacks: { label: function(context) { return ' ' + context.raw.toLocaleString() + ' THB'; } } }
            }
        }
    });

    const ctxBar = document.getElementById('monthlyChart').getContext('2d');
    myBarChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
            datasets: [{
                label: 'ยอดใช้จ่าย (THB)', data: [],
                backgroundColor: 'rgba(0, 242, 254, 0.4)', borderColor: '#00f2fe',
                borderWidth: 1, borderRadius: 6, hoverBackgroundColor: 'rgba(0, 242, 254, 0.7)'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#8b95a5', family: "'Prompt', sans-serif" } },
                x: { grid: { display: false }, ticks: { color: '#8b95a5', family: "'Prompt', sans-serif" } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function(context) { return context.raw.toLocaleString() + ' THB'; } } }
            }
        }
    });

    fetchAndRenderData();

    document.querySelector('#view-transactions .filter-input').addEventListener('input', renderTransactions);
    document.querySelectorAll('#view-transactions .filter-select').forEach(el => el.addEventListener('change', renderTransactions));
    document.querySelector('#view-reports .filter-select').addEventListener('change', renderReports);
});

// ==========================================
// 7. ระบบบันทึกข้อมูลด่วนผ่าน AI (ไป n8n)
// ==========================================
const form = document.getElementById('ai-form');
const input = document.getElementById('expense-input');
const btn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');

function showToast(message, isError = false) {
    toastMsg.innerText = message;
    toast.style.borderColor = isError ? "var(--accent-pink)" : "var(--accent-cyan)";
    toast.querySelector('i').className = isError ? "ph-fill ph-warning-circle" : "ph-fill ph-sparkle";
    toast.querySelector('i').style.color = isError ? "var(--accent-pink)" : "var(--accent-cyan)";
    toast.className = "show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3500);
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputValue = input.value.trim();
    if (!inputValue) return;

    btn.disabled = true;
    btnText.innerText = 'กำลังประมวลผล...';
    
    try {
        const payload = { "raw_input": inputValue };
        const response = await fetch(YOUR_MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('Network response was not ok');
        
        showToast('✨ AI บันทึกรายจ่ายของคุณแล้ว!');
        input.value = '';
        
        setTimeout(() => { fetchAndRenderData(); }, 3500);

    } catch (error) {
        console.error('Error logging expense:', error);
        showToast('❌ เกิดข้อผิดพลาด ไม่สามารถบันทึกได้', true);
    } finally {
        btn.disabled = false;
        btnText.innerText = 'บันทึกข้อมูล';
    }
});

// ==========================================
// 8. ระบบสลับหน้า (UI Routing)
// ==========================================
const navDashboard = document.getElementById('nav-dashboard');
const navTransactions = document.getElementById('nav-transactions');
const navReports = document.getElementById('nav-reports');
const viewDashboard = document.getElementById('view-dashboard');
const viewTransactions = document.getElementById('view-transactions');
const viewReports = document.getElementById('view-reports');
const mainTitle = document.getElementById('main-title');
const linkViewAll = document.getElementById('link-view-all');

function setActiveNav(activeId) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
}

navDashboard.addEventListener('click', (e) => {
    if(e) e.preventDefault(); setActiveNav('nav-dashboard');
    viewTransactions.style.display = 'none'; viewReports.style.display = 'none';
    viewDashboard.style.display = 'grid'; mainTitle.innerText = 'ภาพรวมการใช้จ่าย';
});

const showTransactions = (e) => {
    if(e) e.preventDefault(); setActiveNav('nav-transactions');
    viewDashboard.style.display = 'none'; viewReports.style.display = 'none';
    viewTransactions.style.display = 'block'; mainTitle.innerText = 'รายการธุรกรรมทั้งหมด';
};
navTransactions.addEventListener('click', showTransactions);
linkViewAll.addEventListener('click', showTransactions);

navReports.addEventListener('click', (e) => {
    if(e) e.preventDefault(); setActiveNav('nav-reports');
    viewDashboard.style.display = 'none'; viewTransactions.style.display = 'none';
    viewReports.style.display = 'grid'; mainTitle.innerText = 'รายงานสรุปผลการใช้จ่าย';
});