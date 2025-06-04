// GPU 資料庫前端應用程式
class GPUApp {    constructor() {
        this.currentGPUs = [];
        this.currentSortField = null;
        this.currentSortDirection = 'asc';
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

    // 排序 GPU 資料
    sortGPUs(field) {
        // 如果點擊同一個欄位，切換排序方向
        if (this.currentSortField === field) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortField = field;
            this.currentSortDirection = 'asc';
        }

        const sortedGPUs = [...this.currentGPUs];
        
        sortedGPUs.sort((a, b) => {
            let valueA, valueB;
            
            // 根據欄位類型提取適當的值
            switch (field) {
                case 'brand':
                    valueA = a.brand || '';
                    valueB = b.brand || '';
                    break;
                case 'name':
                    valueA = a.name || '';
                    valueB = b.name || '';
                    break;
                case 'release_year':
                    valueA = a.release_year ? parseInt(a.release_year) : 0;
                    valueB = b.release_year ? parseInt(b.release_year) : 0;
                    break;
                case 'launch_price':
                    valueA = a.launch_price ? parseFloat(a.launch_price) : 0;
                    valueB = b.launch_price ? parseFloat(b.launch_price) : 0;
                    break;
                case 'pixel_rate':
                    valueA = a.pixel_rate ? parseFloat(a.pixel_rate.replace(/[^\d.]/g, '')) : 0;
                    valueB = b.pixel_rate ? parseFloat(b.pixel_rate.replace(/[^\d.]/g, '')) : 0;
                    break;
                case 'texture_rate':
                    valueA = a.texture_rate ? parseFloat(a.texture_rate.replace(/[^\d.]/g, '')) : 0;
                    valueB = b.texture_rate ? parseFloat(b.texture_rate.replace(/[^\d.]/g, '')) : 0;
                    break;                case 'fp32':
                    // 處理 FP32 性能單位 (GFLOPS 和 TFLOPS)
                    valueA = this.normalizeFP32(a.fp32);
                    valueB = this.normalizeFP32(b.fp32);
                    break;
                case 'memory_size':
                    // 處理記憶體大小單位 (GB 和 MB)
                    valueA = this.normalizeMemory(a.memory_size);
                    valueB = this.normalizeMemory(b.memory_size);
                    break;
                default:
                    return 0;
            }

            // 處理文字比較
            if (typeof valueA === 'string' && typeof valueB === 'string') {
                if (this.currentSortDirection === 'asc') {
                    return valueA.localeCompare(valueB);
                } else {
                    return valueB.localeCompare(valueA);
                }
            }
            
            // 處理數字比較
            if (this.currentSortDirection === 'asc') {
                return valueA - valueB;
            } else {
                return valueB - valueA;
            }
        });

        this.displayGPUs(sortedGPUs);
    }    // 顯示 GPU 資料
    displayGPUs(gpus) {
        const tableContainer = document.getElementById('gpuTable');
        this.updateGPUCount(gpus.length);

        if (gpus.length === 0) {
            tableContainer.innerHTML = '<p class="text-muted text-center">沒有找到符合條件的 GPU 資料</p>';
            return;
        }

        // 生成排序圖標
        const getSortIcon = (field) => {
            if (this.currentSortField !== field) {
                return `<i class="small ms-1">⇅</i>`;
            }
            return this.currentSortDirection === 'asc' 
                ? `<i class="small text-warning ms-1">▲</i>` 
                : `<i class="small text-warning ms-1">▼</i>`;
        };

        const table = `
            <table class="table table-striped table-hover">
                <thead class="table-dark">
                    <tr>
                        <th style="cursor: pointer;" onclick="sortGPUs('brand')">品牌 ${getSortIcon('brand')}</th>
                        <th style="cursor: pointer;" onclick="sortGPUs('name')">型號 ${getSortIcon('name')}</th>
                        <th style="cursor: pointer;" onclick="sortGPUs('release_year')">發布年份 ${getSortIcon('release_year')}</th>
                        <th style="cursor: pointer;" onclick="sortGPUs('launch_price')">發售價格 ${getSortIcon('launch_price')}</th>
                        <th style="cursor: pointer;" onclick="sortGPUs('pixel_rate')">像素填充率 ${getSortIcon('pixel_rate')}</th>
                        <th style="cursor: pointer;" onclick="sortGPUs('texture_rate')">紋理填充率 ${getSortIcon('texture_rate')}</th>
                        <th style="cursor: pointer;" onclick="sortGPUs('fp32')">FP32 性能 ${getSortIcon('fp32')}</th>
                        <th style="cursor: pointer;" onclick="sortGPUs('memory_size')">記憶體大小 ${getSortIcon('memory_size')}</th>
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
    }    // 取得品牌顏色
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
    
    // 標準化 FP32 性能值 (統一轉為 GFLOPS)
    normalizeFP32(value) {
        if (!value) return 0;
        
        // 清除非數字和小數點以外的字符，但保留單位信息
        const cleanValue = value.toString().replace(/,/g, '');
        
        // 檢查是否為 TFLOPS
        if (cleanValue.toUpperCase().includes('TFLOPS')) {
            // 將 TFLOPS 轉為 GFLOPS (1 TFLOPS = 1000 GFLOPS)
            const numValue = parseFloat(cleanValue.replace(/[^\d.]/g, ''));
            return numValue * 1000;
        } else {
            // 已是 GFLOPS 或其他單位
            return parseFloat(cleanValue.replace(/[^\d.]/g, ''));
        }
    }
    
    // 標準化記憶體大小 (統一轉為 MB)
    normalizeMemory(value) {
        if (!value) return 0;
        
        // 清除非數字和小數點以外的字符，但保留單位信息
        const cleanValue = value.toString().replace(/,/g, '');
        
        // 檢查是否為 GB
        if (cleanValue.toUpperCase().includes('GB')) {
            // 將 GB 轉為 MB (1 GB = 1024 MB)
            const numValue = parseFloat(cleanValue.replace(/[^\d.]/g, ''));
            return numValue * 1024;
        } else {
            // 已是 MB 或其他單位
            return parseFloat(cleanValue.replace(/[^\d.]/g, ''));
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

function sortGPUs(field) {
    gpuApp.sortGPUs(field);
}

// 按 Enter 鍵搜尋
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchGPUs();
        }
    });
});
