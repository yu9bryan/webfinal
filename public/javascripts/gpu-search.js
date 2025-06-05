// 當頁面加載完成
document.addEventListener('DOMContentLoaded', function() {
  // 搜索表單提交處理
  document.getElementById('gpu-search-form').addEventListener('submit', searchGPUs);
  
  // 抓取表單提交處理
  document.getElementById('fetch-form').addEventListener('submit', fetchSelectedGPUs);
  
  // 全選和取消全選按鈕
  document.getElementById('select-all').addEventListener('click', function() {
    const checkboxes = document.querySelectorAll('.gpu-checkbox');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    updateSelectionCount();
  });
  
  document.getElementById('select-none').addEventListener('click', function() {
    const checkboxes = document.querySelectorAll('.gpu-checkbox');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    updateSelectionCount();
  });
  
  // 匯入資料庫按鈕
  document.getElementById('import-to-db').addEventListener('click', importToDb);
});  // 搜尋 GPU
async function searchGPUs(e) {
  e.preventDefault();
  const keyword = document.getElementById('keyword').value.trim();
  const resultDiv = document.getElementById('result');
  const searchResultDiv = document.getElementById('search-result');
  const searchBtn = document.querySelector('#gpu-search-form button');
  const originalBtnText = searchBtn.innerHTML;
  
  if (!keyword) {
    resultDiv.innerHTML = '<span class="error">請輸入搜尋關鍵字</span>';
    return;
  }
  
  // 更改按鈕為加載狀態
  searchBtn.disabled = true;
  searchBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 搜尋中...';
  
  // 先隱藏搜尋結果區域，顯示加載中
  searchResultDiv.classList.add('hidden');
  resultDiv.innerHTML = '<span class="loading">搜尋中，請稍候...</span>';
  
  try {
    const res = await fetch('/api/gpu-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword })
    });
    
    const data = await res.json();
    
    if (data.error) {
      let debugInfo = '';
      if (data.debug) {
        debugInfo = `<details><summary>除錯資訊</summary><pre class="bg-dark text-white p-3 mt-2 rounded">${JSON.stringify(data.debug, null, 2)}</pre></details>`;
      }
      resultDiv.innerHTML = `<span class="error">${data.error}</span>` + debugInfo;
      return;
    }
    
    // 處理搜尋結果
    if (data.results && data.results.length > 0) {
      // 清空原有結果
      resultDiv.innerHTML = '';
      
      // 顯示搜尋結果區域
      searchResultDiv.classList.remove('hidden');
      
      // 填充 GPU 列表
      const gpuListDiv = document.getElementById('gpu-list');
      gpuListDiv.innerHTML = '';
      
      data.results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'gpu-item';
        
        // 修正可能的編碼問題
        const itemName = decodeURIComponent(escape(item.name));
        
        div.innerHTML = `
          <label class="d-flex align-items-center">
            <input type="checkbox" class="gpu-checkbox form-check-input me-2" data-index="${item.index}" value="${item.index}">
            <span class="me-auto">${itemName}</span>
            <a href="${item.url}" target="_blank" class="ms-2 btn btn-sm btn-outline-light">
              <i class="bi bi-box-arrow-up-right"></i> 詳情
            </a>
          </label>
        `;
        gpuListDiv.appendChild(div);
        
        // 添加更改事件處理程序
        div.querySelector('input').addEventListener('change', updateSelectionCount);
      });
      
      // 保存關鍵字用於後續抓取
      document.getElementById('fetch-keyword').value = keyword;
      
      // 更新選取計數
      updateSelectionCount();
      
      // 滾動到結果區域
      searchResultDiv.scrollIntoView({ behavior: 'smooth' });
      
    } else {
      resultDiv.innerHTML = `
        <div class="error">
          查無結果，請嘗試其他關鍵字
          <button class="btn btn-sm btn-outline-light ms-3" onclick="document.getElementById('keyword').focus()">
            <i class="bi bi-arrow-repeat"></i> 重新搜尋
          </button>
        </div>`;
    }
    
  } catch (err) {
    resultDiv.innerHTML = `<div class="error"><i class="bi bi-exclamation-triangle me-2"></i>發生錯誤：${err}</div>`;
  } finally {
    // 恢復按鈕狀態
    searchBtn.disabled = false;
    searchBtn.innerHTML = originalBtnText;
  }
}

// 更新已選擇項目計數
function updateSelectionCount() {
  const checked = document.querySelectorAll('.gpu-checkbox:checked');
  const countSpan = document.getElementById('selection-count');
  countSpan.textContent = `(已選擇 ${checked.length} 項)`;
}

// 抓取選定的 GPU
async function fetchSelectedGPUs(e) {
  e.preventDefault();
  
  const keyword = document.getElementById('fetch-keyword').value.trim();
  const resultDiv = document.getElementById('result');
  const importSection = document.getElementById('import-section');
  const fetchBtn = document.querySelector('#fetch-form button');
  const originalBtnText = fetchBtn.innerHTML;
  
  // 隱藏匯入區域
  importSection.classList.add('hidden');
  
  // 獲取所有選中的 checkbox
  const checked = document.querySelectorAll('.gpu-checkbox:checked');
  const selectedIndices = Array.from(checked).map(checkbox => parseInt(checkbox.value));
  
  if (selectedIndices.length === 0) {
    resultDiv.innerHTML = `
      <div class="error">
        請至少選擇一個 GPU
        <button class="btn btn-sm btn-outline-light ms-3" onclick="document.querySelector('#select-all').click()">
          <i class="bi bi-check-all"></i> 全選
        </button>
      </div>`;
    return;
  }
  
  // 更改按鈕為加載狀態
  fetchBtn.disabled = true;
  fetchBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 抓取中...';
  
  resultDiv.innerHTML = `
    <div class="p-4 text-center">
      <div class="spinner-border text-success mb-3" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="loading">正在從 TechPowerUp 抓取 ${selectedIndices.length} 個 GPU 資料，請稍候...</p>
      <small class="text-muted">* 此過程可能需要 15-30 秒</small>
    </div>`;
  
  try {
    const res = await fetch('/api/gpu-fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, selectedIndices })
    });
    
    const data = await res.json();
    
    if (data.error) {
      let debugInfo = '';
      if (data.debug) {
        debugInfo = `<details><summary>除錯資訊</summary><pre class="bg-dark text-white p-3 mt-2 rounded">${JSON.stringify(data.debug, null, 2)}</pre></details>`;
      }
      resultDiv.innerHTML = `<div class="error">${data.error}</div>` + debugInfo;
    } else {
      let html = '<div class="p-3">';
      
      if (data.links && data.links.length > 0) {
        html += `
          <div class="d-flex align-items-center mb-3">
            <i class="bi bi-check-circle-fill text-success me-2" style="font-size: 1.5rem;"></i>
            <h3 class="mb-0">抓取完成，共 ${data.links.length} 個結果</h3>
          </div>
          <div class="row mb-3">
            <div class="col-md-8">
              <div class="card bg-dark">
                <div class="card-header bg-success bg-opacity-25 text-white">
                  <i class="bi bi-gpu-card me-1"></i> 已抓取的 GPU
                </div>
                <div class="card-body">
                  <ul class="list-group list-group-flush bg-transparent">`;
        
        data.links.forEach(link => {
          html += `
            <li class="list-group-item bg-dark text-white border-bottom border-success border-opacity-25">
              <div class="d-flex justify-content-between align-items-center">
                <span>${link.name}</span>
                <a href="${link.url}" target="_blank" class="btn btn-sm btn-outline-light">
                  <i class="bi bi-box-arrow-up-right"></i> 詳情
                </a>
              </div>
            </li>`;
        });
        
        html += `
                  </ul>
                </div>
              </div>
            </div>
          </div>`;
      }
      
      if (data.csv_url) {
        html += `
          <div class="success mb-4">
            <i class="bi bi-file-earmark-excel me-2"></i>
            已產生 CSV：
            <a href="${data.csv_url}" download class="btn btn-success ms-2">
              <i class="bi bi-download"></i> 下載結果
            </a>
          </div>`;
      }
      
      // 顯示原始輸出（調試用）
      if (data.raw_stdout) {
        html += `<details class="mt-4">
          <summary class="text-muted cursor-pointer">開發者詳細資訊</summary>
          <pre class="mt-2 p-3 bg-dark text-white rounded" style="max-height: 300px; overflow: auto;">${data.raw_stdout}</pre>
        </details>`;
      }
      
      html += '</div>';
      
      if (!html) html = '<div class="error">抓取未返回任何結果</div>';
      resultDiv.innerHTML = html;
      
      // 如果抓取成功且有數據，顯示匯入資料庫按鈕
      if (data.links && data.links.length > 0) {
        // 保存抓取的數據到全局變量，供匯入功能使用
        window.fetchedGpuData = parseGpuDataFromOutput(data.raw_stdout);
        // 顯示匯入區域
        importSection.classList.remove('hidden');
        // 平滑滾動到匯入區域
        importSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    
  } catch (err) {
    resultDiv.innerHTML = `<div class="error"><i class="bi bi-exclamation-triangle me-2"></i>發生錯誤：${err}</div>`;
  } finally {
    // 恢復按鈕狀態
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = originalBtnText;
  }
}

// 從Python輸出解析GPU數據
function parseGpuDataFromOutput(stdout) {
  if (!stdout) return [];
  
  const gpuData = [];
  const lines = stdout.split('\n');
  let currentGpu = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 檢查是否開始解析新的 GPU
    const gpuMatch = line.match(/\[(\d+)\/\d+\] (.+)：正在抓取詳細頁面 → (.+)/);
    if (gpuMatch) {
      // 如果有之前的 GPU 數據，先保存
      if (currentGpu && Object.keys(currentGpu).length > 2) {
        gpuData.push(currentGpu);
      }
      
      // 創建新的 GPU 數據對象
      currentGpu = {
        name: gpuMatch[2],
        source_url: gpuMatch[3]
      };
      continue;
    }
    
    // 解析各項屬性
    if (currentGpu && line.startsWith('brand:')) {
      currentGpu.brand = line.replace('brand:', '').trim();
    } else if (currentGpu && line.startsWith('release_year:')) {
      const year = line.replace('release_year:', '').trim();
      currentGpu.release_year = year !== 'None' ? parseInt(year) : null;
    } else if (currentGpu && line.startsWith('launch_price:')) {
      const price = line.replace('launch_price:', '').trim();
      currentGpu.launch_price = price !== 'None' ? parseInt(price) : null;
    } else if (currentGpu && line.startsWith('pixel_rate:')) {
      currentGpu.pixel_rate = line.replace('pixel_rate:', '').trim();
    } else if (currentGpu && line.startsWith('texture_rate:')) {
      currentGpu.texture_rate = line.replace('texture_rate:', '').trim();
    } else if (currentGpu && line.startsWith('fp16:')) {
      currentGpu.fp16 = line.replace('fp16:', '').trim();
    } else if (currentGpu && line.startsWith('fp32:')) {
      currentGpu.fp32 = line.replace('fp32:', '').trim();
    } else if (currentGpu && line.startsWith('fp64:')) {
      currentGpu.fp64 = line.replace('fp64:', '').trim();
    } else if (currentGpu && line.startsWith('memory_size:')) {
      currentGpu.memory_size = line.replace('memory_size:', '').trim();
    }
  }
  
  // 添加最後一個 GPU
  if (currentGpu && Object.keys(currentGpu).length > 2) {
    gpuData.push(currentGpu);
  }
  
  return gpuData;
}

// 將數據匯入資料庫
async function importToDb() {
  const importBtn = document.getElementById('import-to-db');
  const importResult = document.getElementById('import-result');
  const originalBtnHTML = importBtn.innerHTML;
  
  // 檢查是否有數據可以匯入
  if (!window.fetchedGpuData || window.fetchedGpuData.length === 0) {
    importResult.innerHTML = `
      <div class="alert alert-danger" role="alert">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        沒有可匯入的 GPU 數據
      </div>`;
    return;
  }
  
  // 禁用按鈕，防止重複提交
  importBtn.disabled = true;
  importBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 匯入中...';
  importResult.innerHTML = `
    <div class="d-flex align-items-center">
      <div class="spinner-border spinner-border-sm text-light me-2" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <span class="loading">正在匯入 ${window.fetchedGpuData.length} 筆 GPU 資料到資料庫，請稍候...</span>
    </div>`;
  
  try {
    const res = await fetch('/api/import-gpu-to-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(window.fetchedGpuData)
    });
    
    const result = await res.json();
    
    if (result.success) {
      importResult.innerHTML = `
        <div class="alert alert-success border-success bg-success bg-opacity-25 text-white" role="alert">
          <div class="d-flex">
            <div class="me-3">
              <i class="bi bi-check-circle-fill" style="font-size: 2rem;"></i>
            </div>
            <div>
              <h5 class="alert-heading">匯入成功！</h5>
              <p>共 ${result.total} 筆資料</p>
              <hr class="border-light">
              <div class="d-flex justify-content-between">
                <span><i class="bi bi-check-circle me-1"></i> 成功: ${result.successCount}</span>
                ${result.failCount > 0 ? `<span><i class="bi bi-x-circle me-1"></i> 失敗: ${result.failCount}</span>` : ''}
              </div>
              <div class="mt-3">
                <a href="/" class="btn btn-sm btn-outline-light me-2">
                  <i class="bi bi-house"></i> 回到首頁
                </a>
                <a href="/charts" class="btn btn-sm btn-outline-light">
                  <i class="bi bi-graph-up"></i> 查看圖表
                </a>
              </div>
            </div>
          </div>
        </div>`;
    } else {
      importResult.innerHTML = `
        <div class="alert alert-danger" role="alert">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          匯入失敗：${result.error || '未知錯誤'}
        </div>`;
    }
  } catch (err) {
    importResult.innerHTML = `
      <div class="alert alert-danger" role="alert">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        匯入時發生錯誤：${err}
      </div>`;
  } finally {
    // 恢復按鈕狀態
    importBtn.disabled = false;
    importBtn.innerHTML = originalBtnHTML;
  }
}