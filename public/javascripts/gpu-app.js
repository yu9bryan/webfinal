// GPU 資料庫前端應用程式
class GPUApp {    constructor() {
        this.currentGPUs = [];
        this.loadAllGPUs();
        this.loadStats();
    }

    // 載入統計資料
    async loadStats() {
        try {
            const response = await fetch('/api/stats');
            const stats = await response.json();
            this.updateStats(stats);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    // 更新統計卡片
    updateStats(stats) {
        document.getElementById('totalGPUsCount').textContent = stats.totalGPUs ? stats.totalGPUs.toLocaleString() : '-';
        document.getElementById('brandCount').textContent = stats.brandCount || '-';
        document.getElementById('yearRangeDisplay').textContent = stats.yearRange || '-';
        document.getElementById('avgPriceDisplay').textContent = stats.avgPrice ? `$${stats.avgPrice.toLocaleString()}` : '-';
    }

    // 顯示載入狀態
    showLoading(show = true) {
        const loading = document.getElementById('loading');
        if (show) {
            loading.classList.remove('d-none');
        } else {
            loading.classList.add('d-none');
        }
    }

    // 更新 GPU 數量顯示
    updateGPUCount(count) {
        document.getElementById('gpuCount').textContent = `${count} 個結果`;
    }

    // 載入所有 GPU
    async loadAllGPUs() {
        this.showLoading(true);
        try {
            const response = await fetch('/api/gpus');
            const gpus = await response.json();
            this.currentGPUs = gpus;
            this.displayGPUs(gpus);
        } catch (error) {
            console.error('Error loading GPUs:', error);
            this.displayError('載入 GPU 資料時發生錯誤');
        }
        this.showLoading(false);
    }

    // 依品牌篩選
    async filterByBrand() {
        const brand = document.getElementById('brandSelect').value;
        if (!brand) {
            this.loadAllGPUs();
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch(`/api/gpus/brand/${encodeURIComponent(brand)}`);
            const gpus = await response.json();
            this.currentGPUs = gpus;
            this.displayGPUs(gpus);
        } catch (error) {
            console.error('Error filtering by brand:', error);
            this.displayError('篩選品牌時發生錯誤');
        }
        this.showLoading(false);
    }

    // 依年份篩選
    async filterByYear() {
        const startYear = document.getElementById('startYear').value;
        const endYear = document.getElementById('endYear').value;

        if (!startYear || !endYear) {
            alert('請輸入起始年份和結束年份');
            return;
        }

        if (parseInt(startYear) > parseInt(endYear)) {
            alert('起始年份不能大於結束年份');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch(`/api/gpus/year/${startYear}/${endYear}`);
            const gpus = await response.json();
            this.currentGPUs = gpus;
            this.displayGPUs(gpus);
        } catch (error) {
            console.error('Error filtering by year:', error);
            this.displayError('依年份篩選時發生錯誤');
        }
        this.showLoading(false);
    }

    // 搜尋 GPU
    async searchGPUs() {
        const searchTerm = document.getElementById('searchInput').value.trim();
        if (!searchTerm) {
            alert('請輸入搜尋關鍵字');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch(`/api/gpus/search/${encodeURIComponent(searchTerm)}`);
            const gpus = await response.json();
            this.currentGPUs = gpus;
            this.displayGPUs(gpus);
        } catch (error) {
            console.error('Error searching GPUs:', error);
            this.displayError('搜尋 GPU 時發生錯誤');
        }
        this.showLoading(false);
    }

    // 顯示 GPU 資料
    displayGPUs(gpus) {
        const tableContainer = document.getElementById('gpuTable');
        this.updateGPUCount(gpus.length);

        if (gpus.length === 0) {
            tableContainer.innerHTML = '<p class="text-muted text-center">沒有找到符合條件的 GPU 資料</p>';
            return;
        }

        const table = `
            <table class="table table-striped table-hover">
                <thead class="table-dark">
                    <tr>
                        <th>品牌</th>
                        <th>型號</th>
                        <th>發布年份</th>
                        <th>發售價格</th>
                        <th>像素填充率</th>
                        <th>紋理填充率</th>
                        <th>FP32 性能</th>
                        <th>記憶體大小</th>
                        <th>詳細資訊</th>
                    </tr>
                </thead>
                <tbody>
                    ${gpus.map(gpu => `
                        <tr>
                            <td><span class="badge bg-${this.getBrandColor(gpu.brand)}">${gpu.brand}</span></td>
                            <td><strong>${gpu.name}</strong></td>
                            <td>${gpu.release_year || 'N/A'}</td>
                            <td>${gpu.launch_price ? '$' + gpu.launch_price : 'N/A'}</td>
                            <td>${gpu.pixel_rate || 'N/A'}</td>
                            <td>${gpu.texture_rate || 'N/A'}</td>
                            <td>${gpu.fp32 || 'N/A'}</td>
                            <td>${gpu.memory_size || 'N/A'}</td>                            <td>
                                ${gpu.source_url ? 
                                    `<a href="${gpu.source_url}" target="_blank" class="btn btn-sm btn-success">查看</a>` : 
                                    'N/A'
                                }
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        tableContainer.innerHTML = table;
    }

    // 取得品牌顏色
    getBrandColor(brand) {
        switch (brand.toUpperCase()) {
            case 'NVIDIA':
                return 'success';
            case 'AMD':
                return 'danger';
            case 'INTEL':
                return 'primary';
            default:
                return 'secondary';
        }
    }

    // 顯示錯誤訊息
    displayError(message) {
        const tableContainer = document.getElementById('gpuTable');
        tableContainer.innerHTML = `<p class="text-danger text-center">${message}</p>`;
        this.updateGPUCount(0);
    }
}

// 全域函數供 HTML 呼叫
let gpuApp;

// 初始化應用程式
document.addEventListener('DOMContentLoaded', () => {
    gpuApp = new GPUApp();
});

// 全域函數
function loadAllGPUs() {
    // 清除篩選條件
    document.getElementById('brandSelect').value = '';
    document.getElementById('startYear').value = '';
    document.getElementById('endYear').value = '';
    document.getElementById('searchInput').value = '';
    
    gpuApp.loadAllGPUs();
}

function filterByBrand() {
    gpuApp.filterByBrand();
}

function filterByYear() {
    gpuApp.filterByYear();
}

function searchGPUs() {
    gpuApp.searchGPUs();
}

// 按 Enter 鍵搜尋
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchGPUs();
        }
    });
});
