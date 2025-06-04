# GPU 價格對比性能分析系統

這是一個基於 Node.js 和 SQLite 的 GPU 性能分析系統，專注於比較不同 GPU 的每美元性能比率。系統提供了豐富的圖表和數據視覺化功能，幫助用戶分析 NVIDIA 和 AMD 等廠商的 GPU 在不同時期的性價比變化。

## 目錄

- [資料庫格式說明](#資料庫格式說明)
- [API 說明](#api-說明)
- [品項搜尋程式碼](#品項搜尋程式碼)
- [數據單位轉換](#數據單位轉換)
- [圖表程式碼](#圖表程式碼)
- [安裝與運行](#安裝與運行)

## 資料庫格式說明

本系統使用 SQLite 作為資料庫，資料表結構如下：

### GPU 資料表 (gpus)

```sql
CREATE TABLE IF NOT EXISTS gpus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT NOT NULL,           -- GPU 品牌 (例如: NVIDIA, AMD)
    name TEXT NOT NULL,            -- GPU 型號名稱
    release_year INTEGER,          -- 發布年份
    launch_price REAL,             -- 發售價格 (美元)
    pixel_rate TEXT,               -- 像素填充率
    texture_rate TEXT,             -- 紋理填充率
    fp16 TEXT,                     -- FP16 (半精度) 運算性能
    fp32 TEXT,                     -- FP32 (單精度) 運算性能
    fp64 TEXT,                     -- FP64 (雙精度) 運算性能
    memory_size TEXT,              -- 記憶體大小
    source_url TEXT                -- 資料來源 URL
)
```

### 資料來源

GPU 資料來自 TechPowerUp GPU 資料庫，包含了以下檔案：

- `techpowerup_gpu_incremental.csv` - NVIDIA GPU 資料集
- `techpowerup_gpu_incrementalAMD.csv` - AMD GPU 資料集
- `new_techpowerup_gpu.csv` - 更新的 GPU 資料

## API 說明

系統提供以下 API 端點：

### 1. 獲取所有 GPU

```
GET /api/gpus
```

返回資料庫中所有 GPU 的完整資訊。

### 2. 依品牌篩選 GPU

```
GET /api/gpus/brand/:brand
```

參數：
- `brand` - GPU 品牌名稱 (如 "NVIDIA", "AMD")

返回指定品牌的所有 GPU。

### 3. 依年份範圍篩選 GPU

```
GET /api/gpus/year/:startYear/:endYear
```

參數：
- `startYear` - 起始年份
- `endYear` - 結束年份

返回指定年份範圍內的所有 GPU。

### 4. 搜尋 GPU

```
GET /api/gpus/search/:searchTerm
```

參數：
- `searchTerm` - 搜尋關鍵字 (品牌或型號名稱)

返回名稱或品牌包含搜尋關鍵字的所有 GPU。

### 5. 獲取統計資料

```
GET /api/stats
```

返回系統統計資料，包括總 GPU 數量、品牌數量、年份範圍和平均價格。

### 6. 獲取圖表資料

```
GET /api/chart-data
```

返回用於生成性能趨勢圖表的資料，包括每年各性能指標的平均值。

## 品項搜尋與排序程式碼

### 搜尋功能

以下是前端搜尋功能的核心實現：

```javascript
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
```

### 排序功能

系統支援依據多種參數對GPU列表進行排序，包括品牌、型號、發布年份、發售價格、像素填充率、紋理填充率、FP32性能和記憶體大小等。排序功能的實現如下：

```javascript
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
            // 其他欄位處理...
        }

        // 排序邏輯
        if (typeof valueA === 'string' && typeof valueB === 'string') {
            return this.currentSortDirection === 'asc' 
                ? valueA.localeCompare(valueB) 
                : valueB.localeCompare(valueA);
        } else {
            return this.currentSortDirection === 'asc' 
                ? valueA - valueB 
                : valueB - valueA;
        }
    });

    this.displayGPUs(sortedGPUs);
}
```

後端搜尋 API 實現：

```javascript
// 搜尋 GPU
const searchGPUs = (searchTerm, callback) => {
    const sql = 'SELECT * FROM gpus WHERE name LIKE ? OR brand LIKE ? ORDER BY release_year DESC, brand, name';
    const searchPattern = `%${searchTerm}%`;
    db.all(sql, [searchPattern, searchPattern], (err, rows) => {
        if (err) {
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
};
```

## 數據單位轉換

本系統處理多種 GPU 性能指標，需要在不同單位間進行轉換。以下是常見的單位轉換邏輯：

### 1. 像素與紋理填充率

像素填充率和紋理填充率的單位通常為 GPixel/s 或 GTexel/s，在計算每美元性能時需要轉換：

```javascript
// 每美元像素填充率轉換 (GPixel/s/$ 到 mGPixel/s/$，乘以 1000 便於顯示)
const pixelPerDollar = parseFloat(gpu.pixel_rate) / parseFloat(gpu.launch_price) * 1000;

// 每美元紋理填充率轉換 (GTexel/s/$ 到 mGTexel/s/$)
const texturePerDollar = parseFloat(gpu.texture_rate) / parseFloat(gpu.launch_price) * 1000;
```

### 2. 浮點運算性能

FP32 (單精度浮點) 性能數據格式不統一，有些以 GFLOPS 為單位，有些則以 TFLOPS 為單位，例如：
- "1,175.6 GFLOPS"
- "326.4 GFLOPS"
- "2.289 TFLOPS"

在處理時需要進行單位轉換，通常將所有數據轉換為 GFLOPS 進行運算：

```javascript
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

// 每美元 FP32 性能 (GFLOPS/$)
const fp32PerDollar = normalizeFP32(gpu.fp32) / parseFloat(gpu.launch_price);
```

### 3. 記憶體容量

記憶體容量數據也存在不同單位，有些以 GB 為單位，有些則以 MB 為單位，例如：
- "6 GB"
- "1792 MB"
- "512 MB"
- "2.5 GB"

在處理時需要進行單位轉換，通常將所有數據轉換為 MB 進行運算：

```javascript
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

// 每美元記憶體容量 (MB/$)
const memoryPerDollar = normalizeMemory(gpu.memory_size) / parseFloat(gpu.launch_price);
```

## 圖表程式碼

系統使用 Chart.js 庫創建性能趨勢圖表。以下是創建圖表的核心函數：

```javascript
// 建立像素填充率圖表
createPixelChart() {
    const ctx = document.getElementById('pixelChart').getContext('2d');
    
    this.charts.pixel = new Chart(ctx, {
        type: 'line',
        data: {
            labels: this.chartData.map(d => d.year),
            datasets: [{
                label: '每美元像素填充率 (mGPixel/s/$)',
                data: [], // 初始為空，透過動畫逐步添加
                borderColor: '#74B600',
                backgroundColor: 'rgba(116, 182, 0, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.6, // 增加平滑度
                pointBackgroundColor: '#74B600',
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: '#74B600',
                pointHoverBorderColor: '#000000',
                pointHoverBorderWidth: 3
            }]
        },
        options: this.getChartOptions('每美元像素填充率 (mGPixel/s/$)')
    });
    
    // 啟動動畫效果
    this.animateChart('pixel', this.chartData.map(d => (d.pixelPerDollar * 1000).toFixed(3)), 300);
}
```

圖表選項配置：

```javascript
// 圖表選項配置
getChartOptions(title) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: false
            },
            legend: {
                display: true,
                labels: {
                    color: '#FFFFFF',
                    font: {
                        size: 14
                    }
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleFont: {
                    size: 16
                },
                bodyFont: {
                    size: 14
                },
                callbacks: {
                    label: function(context) {
                        return `${context.dataset.label}: ${context.parsed.y}`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: '#FFFFFF'
                }
            },
            y: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: '#FFFFFF'
                },
                title: {
                    display: true,
                    text: title,
                    color: '#FFFFFF',
                    font: {
                        size: 14
                    }
                }
            }
        }
    };
}
```

## 安裝與運行

### 前置需求

- Node.js 14.x 或更高版本
- npm 6.x 或更高版本

### 安裝步驟

1. 克隆或下載專案
2. 安裝依賴
   ```
   npm install
   ```

3. 初始化資料庫
   ```
   node import_csv.js
   ```

4. 啟動伺服器
   ```
   npm start
   ```
   或
   ```
   node .\bin\www
   ```
   或直接執行
   ```
   start_server.bat
   ```

5. 瀏覽器訪問 `http://localhost:3000`

### 專案結構

```
app.js                           # Express 應用程式入口點
bin/www                          # HTTP 伺服器啟動檔案
database/
  db.js                          # 資料庫連接與操作
  gpu_database.db                # SQLite 資料庫檔案
public/
  index.html                     # 主頁面
  charts.html                    # NVIDIA GPU 圖表頁面
  amd-charts.html               # AMD GPU 圖表頁面
  compare-charts.html           # 比較圖表頁面
  javascripts/
    gpu-app.js                   # 主頁面前端 JavaScript
    charts.js                    # NVIDIA 圖表前端 JavaScript
    amd-charts.js               # AMD 圖表前端 JavaScript
    compare-charts.js           # 比較圖表前端 JavaScript
  stylesheets/
    style.css                    # 全局樣式
routes/
  index.js                       # 路由定義
  users.js                       # 用戶路由 (未使用)
```

### 資料更新

若要更新 GPU 資料，請按以下步驟：

1. 準備新的 CSV 資料檔案
2. 執行 import_new_csv.js
   ```
   node import_new_csv.js
   ```

3. 檢查資料品質
   ```
   node check_all_data.js
   ```

4. 如有重複資料，可使用
   ```
   node remove_duplicates.js
   ```
