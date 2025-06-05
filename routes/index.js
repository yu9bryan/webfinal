var express = require('express');
var router = express.Router();
const { getAllGPUs, getGPUsByBrand, getGPUsByYearRange, getGPUById, searchGPUs, insertGPU, getGpuDetailFromCache, saveGpuDetailToCache, clearExpiredCache, saveChatSession, getAllChatSessions, getChatSessionById, deleteChatSession, deleteAllChatSessions } = require('../database/db');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const axios = require('axios');

// IP 請求限制設定
const REQUEST_LIMIT = 10; // 3分鐘內最多10次請求
const TIME_WINDOW = 3 * 60 * 1000; // 3分鐘 (毫秒)
const ipRequestTracker = new Map(); // 儲存每個IP的請求記錄

// IP 請求限制中介軟體
function rateLimitMiddleware(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  const now = Date.now();
  
  // 清理過期的請求記錄
  for (const [ip, requests] of ipRequestTracker.entries()) {
    const validRequests = requests.filter(timestamp => now - timestamp < TIME_WINDOW);
    if (validRequests.length === 0) {
      ipRequestTracker.delete(ip);
    } else {
      ipRequestTracker.set(ip, validRequests);
    }
  }
  
  // 檢查當前IP的請求記錄
  const clientRequests = ipRequestTracker.get(clientIP) || [];
  const recentRequests = clientRequests.filter(timestamp => now - timestamp < TIME_WINDOW);
  
  if (recentRequests.length >= REQUEST_LIMIT) {
    const oldestRequest = Math.min(...recentRequests);
    const resetTime = Math.ceil((oldestRequest + TIME_WINDOW - now) / 1000);
    
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `請求過於頻繁，請 ${resetTime} 秒後再試。(3分鐘內最多可發送 ${REQUEST_LIMIT} 次請求)`,
      retryAfter: resetTime
    });
  }
  
  // 記錄此次請求
  recentRequests.push(now);
  ipRequestTracker.set(clientIP, recentRequests);
  
  console.log(`IP ${clientIP} 當前請求次數: ${recentRequests.length}/${REQUEST_LIMIT}`);
  next();
}

/* GET home page. */
router.get('/', function(req, res, next) {
  res.sendFile('index.html', { root: './public' });
});

/* GET charts page */
router.get('/charts', function(req, res, next) {
  res.sendFile('charts.html', { root: './public' });
});

/* GET AMD charts page */
router.get('/amd-charts', function(req, res, next) {
  res.sendFile('amd-charts.html', { root: './public' });
});

/* GET compare charts page */
router.get('/compare-charts', function(req, res, next) {
  res.sendFile('compare-charts.html', { root: './public' });
});

/* GET DeepSeek chat page */
router.get('/deepseek-chat', function(req, res, next) {
  res.sendFile('deepseek-chat.html', { root: './public' });
});

/* GET chart data API */
router.get('/api/chart-data', function(req, res, next) {
  getAllGPUs((err, gpus) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      // 篩選NVIDIA GPU和有價格和年份的資料
      const validGPUs = gpus.filter(gpu => 
        gpu.launch_price && 
        gpu.launch_price > 0 && 
        gpu.release_year && 
        gpu.release_year > 2000 &&
        gpu.brand && gpu.brand.toLowerCase().includes('nvidia')
      );

      // 按年份分組並計算平均值
      const yearlyData = {};
      
      validGPUs.forEach(gpu => {
        const year = gpu.release_year;
        const price = parseFloat(gpu.launch_price);
        
        if (!yearlyData[year]) {
          yearlyData[year] = {
            year: year,
            gpus: [],
            totalPrice: 0,
            count: 0
          };
        }
        
        yearlyData[year].gpus.push(gpu);
        yearlyData[year].totalPrice += price;
        yearlyData[year].count++;
      });

      // 計算每年的平均性價比
      const chartData = Object.values(yearlyData).map(yearData => {
        const avgPrice = yearData.totalPrice / yearData.count;
        
        // 計算平均性能參數
        let avgPixelRate = 0, avgTextureRate = 0, avgFP32 = 0, avgMemorySize = 0;
        let pixelCount = 0, textureCount = 0, fp32Count = 0, memoryCount = 0;
        
        yearData.gpus.forEach(gpu => {
          // 解析像素填充率
          if (gpu.pixel_rate && gpu.pixel_rate !== 'N/A') {
            const pixelValue = parseFloat(gpu.pixel_rate.replace(/[^\d.]/g, ''));
            if (!isNaN(pixelValue)) {
              avgPixelRate += pixelValue;
              pixelCount++;
            }
          }
          
          // 解析紋理填充率
          if (gpu.texture_rate && gpu.texture_rate !== 'N/A') {
            const textureValue = parseFloat(gpu.texture_rate.replace(/[^\d.]/g, ''));
            if (!isNaN(textureValue)) {
              avgTextureRate += textureValue;
              textureCount++;
            }
          }
          
          // 解析FP32性能
          if (gpu.fp32 && gpu.fp32 !== 'N/A') {
            // 提取數字部分
            const fp32Value = parseFloat(gpu.fp32.replace(/[^\d.]/g, ''));
            if (!isNaN(fp32Value)) {
              // 檢查單位是 TFLOPS 還是 GFLOPS
              const isTFLOPS = gpu.fp32.toLowerCase().includes('tflops');
              // 統一轉換為GFLOPS進行計算
              const valueInGFLOPS = isTFLOPS ? fp32Value * 1000 : fp32Value;
              avgFP32 += valueInGFLOPS;
              fp32Count++;
            }
          }
          
          // 解析記憶體大小
          if (gpu.memory_size && gpu.memory_size !== 'N/A') {
            // 提取數字部分
            const memoryValue = parseFloat(gpu.memory_size.replace(/[^\d.]/g, ''));
            if (!isNaN(memoryValue)) {
              // 檢查單位是 GB 還是 MB
              const isGB = gpu.memory_size.toLowerCase().includes('gb');
              // GB轉換為MB進行統一計算
              const valueInMB = isGB ? memoryValue * 1024 : memoryValue;
              avgMemorySize += valueInMB;
              memoryCount++;
            }
          }
        });
        
        return {
          year: yearData.year,
          avgPrice: Math.round(avgPrice),
          gpuCount: yearData.count,
          // 計算每美元的性能比率
          pixelPerDollar: pixelCount > 0 ? (avgPixelRate / pixelCount) / avgPrice : 0,
          texturePerDollar: textureCount > 0 ? (avgTextureRate / textureCount) / avgPrice : 0,
          fp32PerDollar: fp32Count > 0 ? (avgFP32 / fp32Count) / avgPrice : 0,
          memoryPerDollar: memoryCount > 0 ? (avgMemorySize / memoryCount) / avgPrice : 0,
          // 原始平均值
          avgPixelRate: pixelCount > 0 ? avgPixelRate / pixelCount : 0,
          avgTextureRate: textureCount > 0 ? avgTextureRate / textureCount : 0,
          avgFP32: fp32Count > 0 ? avgFP32 / fp32Count : 0,
          avgMemorySize: memoryCount > 0 ? avgMemorySize / memoryCount : 0
        };
      }).sort((a, b) => a.year - b.year);

      res.json(chartData);
    }
  });
});

/* GET AMD chart data API */
router.get('/api/amd-chart-data', function(req, res, next) {
  getAllGPUs((err, gpus) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      // 篩選AMD GPU和有價格和年份的資料
      const validGPUs = gpus.filter(gpu => 
        gpu.launch_price && 
        gpu.launch_price > 0 && 
        gpu.release_year && 
        gpu.release_year > 2000 &&
        gpu.brand && gpu.brand.toLowerCase().includes('amd')
      );

      // 按年份分組並計算平均值
      const yearlyData = {};
      
      validGPUs.forEach(gpu => {
        const year = gpu.release_year;
        const price = parseFloat(gpu.launch_price);
        
        if (!yearlyData[year]) {
          yearlyData[year] = {
            year: year,
            gpus: [],
            totalPrice: 0,
            count: 0
          };
        }
        
        yearlyData[year].gpus.push(gpu);
        yearlyData[year].totalPrice += price;
        yearlyData[year].count++;
      });

      // 計算每年的平均性價比
      const chartData = Object.values(yearlyData).map(yearData => {
        const avgPrice = yearData.totalPrice / yearData.count;
        
        // 計算平均性能參數
        let avgPixelRate = 0, avgTextureRate = 0, avgFP32 = 0, avgMemorySize = 0;
        let pixelCount = 0, textureCount = 0, fp32Count = 0, memoryCount = 0;
        
        yearData.gpus.forEach(gpu => {
          // 解析像素填充率
          if (gpu.pixel_rate && gpu.pixel_rate !== 'N/A') {
            const pixelValue = parseFloat(gpu.pixel_rate.replace(/[^\d.]/g, ''));
            if (!isNaN(pixelValue)) {
              avgPixelRate += pixelValue;
              pixelCount++;
            }
          }
          
          // 解析紋理填充率
          if (gpu.texture_rate && gpu.texture_rate !== 'N/A') {
            const textureValue = parseFloat(gpu.texture_rate.replace(/[^\d.]/g, ''));
            if (!isNaN(textureValue)) {
              avgTextureRate += textureValue;
              textureCount++;
            }
          }
          
          // 解析FP32性能
          if (gpu.fp32 && gpu.fp32 !== 'N/A') {
            // 提取數字部分
            const fp32Value = parseFloat(gpu.fp32.replace(/[^\d.]/g, ''));
            if (!isNaN(fp32Value)) {
              // 檢查單位是 TFLOPS 還是 GFLOPS
              const isTFLOPS = gpu.fp32.toLowerCase().includes('tflops');
              // 統一轉換為GFLOPS進行計算
              const valueInGFLOPS = isTFLOPS ? fp32Value * 1000 : fp32Value;
              avgFP32 += valueInGFLOPS;
              fp32Count++;
            }
          }
          
          // 解析記憶體大小
          if (gpu.memory_size && gpu.memory_size !== 'N/A') {
            // 提取數字部分
            const memoryValue = parseFloat(gpu.memory_size.replace(/[^\d.]/g, ''));
            if (!isNaN(memoryValue)) {
              // 檢查單位是 GB 還是 MB
              const isGB = gpu.memory_size.toLowerCase().includes('gb');
              // GB轉換為MB進行統一計算
              const valueInMB = isGB ? memoryValue * 1024 : memoryValue;
              avgMemorySize += valueInMB;
              memoryCount++;
            }
          }
        });
        
        return {
          year: yearData.year,
          avgPrice: Math.round(avgPrice),
          gpuCount: yearData.count,
          // 計算每美元的性能比率
          pixelPerDollar: pixelCount > 0 ? (avgPixelRate / pixelCount) / avgPrice : 0,
          texturePerDollar: textureCount > 0 ? (avgTextureRate / textureCount) / avgPrice : 0,
          fp32PerDollar: fp32Count > 0 ? (avgFP32 / fp32Count) / avgPrice : 0,
          memoryPerDollar: memoryCount > 0 ? (avgMemorySize / memoryCount) / avgPrice : 0,
          // 原始平均值
          avgPixelRate: pixelCount > 0 ? avgPixelRate / pixelCount : 0,
          avgTextureRate: textureCount > 0 ? avgTextureRate / textureCount : 0,
          avgFP32: fp32Count > 0 ? avgFP32 / fp32Count : 0,
          avgMemorySize: memoryCount > 0 ? avgMemorySize / memoryCount : 0
        };
      }).sort((a, b) => a.year - b.year);

      res.json(chartData);
    }
  });
});

/* GET all GPUs */
router.get('/api/gpus', function(req, res, next) {
  getAllGPUs((err, gpus) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(gpus);
    }
  });
});

/* GET GPUs by brand */
router.get('/api/gpus/brand/:brand', function(req, res, next) {
  const brand = req.params.brand;
  getGPUsByBrand(brand, (err, gpus) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(gpus);
    }
  });
});

/* GET GPUs by year range */
router.get('/api/gpus/year/:startYear/:endYear', function(req, res, next) {
  const startYear = parseInt(req.params.startYear);
  const endYear = parseInt(req.params.endYear);
  getGPUsByYearRange(startYear, endYear, (err, gpus) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(gpus);
    }
  });
});

/* GET search GPUs */
router.get('/api/gpus/search/:term', function(req, res, next) {
  const searchTerm = req.params.term;
  searchGPUs(searchTerm, (err, gpus) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(gpus);
    }
  });
});

/* GET stats API */
router.get('/api/stats', function(req, res, next) {
  getAllGPUs((err, gpus) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      // 計算統計數據
      const totalGPUs = gpus.length;
      
      // 計算品牌數量
      const brands = new Set();
      gpus.forEach(gpu => {
        if (gpu.name) {
          const brand = gpu.name.split(' ')[0]; // 取第一個詞作為品牌
          brands.add(brand);
        }
      });
      const brandCount = brands.size;
      
      // 計算年份範圍
      const years = gpus
        .filter(gpu => gpu.release_year && gpu.release_year > 2000)
        .map(gpu => gpu.release_year);
      const yearRange = years.length > 0 ? `${Math.min(...years)}-${Math.max(...years)}` : '-';
      
      // 計算平均價格
      const validPrices = gpus
        .filter(gpu => gpu.launch_price && gpu.launch_price > 0)
        .map(gpu => parseFloat(gpu.launch_price));
      const avgPrice = validPrices.length > 0 
        ? Math.round(validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length)
        : 0;
      
      res.json({
        totalGPUs,
        brandCount,
        yearRange,
        avgPrice
      });
    }
  });
});

// GPU 搜尋頁面
router.get('/gpu-search', function(req, res) {
  res.sendFile('gpu-search.html', { root: './public' });
});

// GPU 搜尋 API - 只列出結果，不抓取數據
router.post('/api/gpu-search', function(req, res) {
  const keyword = req.body.keyword;
  if (!keyword) return res.json({ error: '請輸入關鍵字' });
  const pyPath = path.join(__dirname, '../test/01.py');
  
  // 執行 python 腳本（--list-only 模式，只列出結果）
  const pythonExe = 'C:/ProgramData/anaconda3/python.exe';
  const py = spawn(pythonExe, [pyPath, keyword, '--list-only'], { cwd: path.dirname(pyPath) });
  
  let stdout = '', stderr = '';
  let finished = false;
  
  // 設定 20 秒 timeout（僅列出結果應該不需要很長時間）
  const timeout = setTimeout(() => {
    if (!finished) {
      finished = true;
      py.kill('SIGKILL');
      res.json({ error: 'Python 腳本執行逾時（20秒）', debug: {stdout, stderr} });
    }
  }, 20000);
  
  py.stdout.on('data', d => { stdout += d.toString(); });
  py.stderr.on('data', d => { stderr += d.toString(); });
  
  py.on('close', code => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    
    // 解析搜尋結果
    const resultRegex = /\[(\d+)\] ([^\s]+.*?) → (https?:\/\/www\.techpowerup\.com\/gpu-specs\/[^\s\"]+)/g;
    let results = [];
    let match;
    
    while ((match = resultRegex.exec(stdout)) !== null) {
      results.push({
        index: parseInt(match[1]),
        name: match[2],
        url: match[3]
      });
    }
    
    res.json({
      results,
      error: code !== 0 ? (stderr || 'Python 腳本執行失敗') : undefined,
      debug: {stdout, stderr, code}
    });
  });
});

// GPU 抓取 API - 抓取選定的項目
router.post('/api/gpu-fetch', function(req, res) {
  const keyword = req.body.keyword;
  const selectedIndices = req.body.selectedIndices;
  
  if (!keyword) return res.json({ error: '請輸入關鍵字' });
  if (!selectedIndices || !Array.isArray(selectedIndices) || selectedIndices.length === 0) {
    return res.json({ error: '請選擇至少一個項目' });
  }
  
  const pyPath = path.join(__dirname, '../test/01.py');
  // 產生唯一 CSV 路徑（避免多用戶衝突）
  const csvName = `gpu_selected_details_${Date.now()}_${Math.floor(Math.random()*10000)}.csv`;
  const csvPath = path.join(__dirname, '../public', csvName);
  
  // 構建選擇參數
  const selectParam = `--select=${selectedIndices.join(',')}`;
  
  // 執行 python 腳本
  const pythonExe = 'C:/ProgramData/anaconda3/python.exe';
  const py = spawn(pythonExe, [pyPath, keyword, selectParam], { cwd: path.dirname(pyPath) });
  
  let stdout = '', stderr = '';
  let finished = false;
  
  // 設定 60 秒 timeout
  const timeout = setTimeout(() => {
    if (!finished) {
      finished = true;
      py.kill('SIGKILL');
      res.json({ error: 'Python 腳本執行逾時（60秒）', debug: {stdout, stderr} });
    }
  }, 60000);
  
  py.stdout.on('data', d => { stdout += d.toString(); });
  py.stderr.on('data', d => { stderr += d.toString(); });
  
  py.on('close', code => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    
    // 解析 stdout 取得所有 detail_url
    const linkRegex = /https?:\/\/www\.techpowerup\.com\/gpu-specs\/[^\s\"]+/g;
    const nameRegex = /\[\d+\/\d+\] ([^：]+)：正在抓取詳細頁面/;
    let links = [];
    let lines = stdout.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      let urlMatch = lines[i].match(linkRegex);
      let nameMatch = lines[i].match(nameRegex);
      if (urlMatch && nameMatch) {
        links.push({ name: nameMatch[1], url: urlMatch[0] });
      }
    }
    
    // 檢查 CSV 是否存在
    let csv_url = null;
    const defaultCsv = path.join(path.dirname(pyPath), 'gpu_selected_details.csv');
    if (fs.existsSync(defaultCsv)) {
      fs.copyFileSync(defaultCsv, csvPath);
      csv_url = '/' + csvName;
    }
    
    res.json({
      links,
      csv_url,
      error: code !== 0 ? (stderr || 'Python 腳本執行失敗') : undefined,
      debug: {stdout, stderr, code},
      raw_stdout: stdout,
      raw_stderr: stderr
    });
  });
});

/* POST import GPUs */
router.post('/api/import-gpus', function(req, res, next) {
  const { gpus } = req.body;
  if (!gpus || !Array.isArray(gpus) || gpus.length === 0) {
    return res.status(400).json({ error: '無效的 GPU 資料' });
  }
  
  // 批次插入 GPU 資料
  const values = gpus.map(gpu => [
    gpu.name,
    gpu.brand,
    gpu.launch_price,
    gpu.release_year,
    gpu.memory_size,
    gpu.pixel_rate,
    gpu.texture_rate,
    gpu.fp32
  ]);
  
  const sql = `INSERT INTO gpus (name, brand, launch_price, release_year, memory_size, pixel_rate, texture_rate, fp32)
                VALUES ?`;
  
  db.query(sql, [values], (err, result) => {
    if (err) {
      console.error('插入 GPU 資料時發生錯誤:', err);
      return res.status(500).json({ error: '插入 GPU 資料時發生錯誤' });
    }
    
    res.json({ message: 'GPU 資料匯入成功', count: result.affectedRows });
  });
});

// GPU 資料匯入資料庫 API
router.post('/api/import-gpu-to-db', function(req, res) {
  const gpuData = req.body;
  
  if (!gpuData || !Array.isArray(gpuData) || gpuData.length === 0) {
    return res.json({ success: false, error: '無效的 GPU 資料' });
  }
  
  // 計算成功和失敗的次數
  let successCount = 0;
  let failCount = 0;
  let processedCount = 0;
  
  // 使用遞迴方式逐一處理每筆GPU資料
  function processNextGpu(index) {
    if (index >= gpuData.length) {
      // 全部處理完成
      return res.json({ 
        success: true, 
        total: gpuData.length, 
        successCount: successCount, 
        failCount: failCount 
      });
    }
    
    const gpu = gpuData[index];
    
    // 檢查必要欄位
    if (!gpu.brand || !gpu.name) {
      failCount++;
      processedCount++;
      return processNextGpu(index + 1);
    }
    
    // 將數據插入資料庫
    insertGPU(gpu, (err, lastId) => {
      if (err) {
        console.error('匯入 GPU 資料失敗:', err);
        failCount++;
      } else {
        successCount++;
      }
      
      processedCount++;
      processNextGpu(index + 1);
    });
  }
  
  // 開始處理第一筆資料
  processNextGpu(0);
});

/* GPU 搜尋 API */
router.get('/api/search-gpus', async function(req, res, next) {
  const { query } = req.query;
  
  if (!query || query.length < 2) {
    return res.json([]);
  }
  
  try {
    // 使用 Promise 包裝回調函數
    const gpus = await new Promise((resolve, reject) => {
      searchGPUs(query, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
    
    // 限制回傳結果數量
    const limitedResults = gpus.slice(0, 10).map(gpu => ({
      id: gpu.id,
      name: gpu.name
    }));
    res.json(limitedResults);
  } catch (error) {
    console.error('搜尋 GPU 時發生錯誤:', error);
    res.status(500).json({ error: '搜尋失敗' });
  }
});

/* DeepSeek Chat API */
router.post('/api/deepseek-chat', rateLimitMiddleware, async function(req, res, next) {
  const { message, selectedGpus, sessionId } = req.body;
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: '請提供有效的訊息內容' });
  }
  
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  console.log(`收到來自會話 ${sessionId} 的訊息: ${message.substring(0, 50)}...`);
  
  // 設置 Server-Sent Events 標頭
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  try {
    // DeepSeek API 配置
    const apiKey = process.env.DEEPSEEK_API_KEY || 'YOUR_DEEPSEEK_API_KEY';
    const apiUrl = 'https://api.deepseek.com/v1/chat/completions';
    
    // 檢查 API 金鑰
    if (!apiKey || apiKey === 'YOUR_DEEPSEEK_API_KEY') {
      const errorMessage = 'DeepSeek API 金鑰未設置。請在環境變數中設置 DEEPSEEK_API_KEY。';
      res.write(`data: ${JSON.stringify({ content: errorMessage, done: true })}\n\n`);
      res.end();
      return;
    }
    
    // 獲取選中 GPU 的詳細資訊
    let gpuContextInfo = '';
    if (selectedGpus && selectedGpus.length > 0) {
      try {
        gpuContextInfo = await getGpuDetailedInfo(selectedGpus);
      } catch (error) {
        console.error('獲取 GPU 詳細資訊時發生錯誤:', error);
        // 繼續處理，但不包含 GPU 詳細資訊
      }
    }
    
    // 構建完整的訊息內容
    let fullMessage = message;
    if (gpuContextInfo) {
      fullMessage = `${gpuContextInfo}\n\n使用者問題: ${message}\n\n請根據上述 GPU 的詳細技術規格資訊來回答使用者的問題。`;
    }
    
    // 構建請求資料
    const requestData = {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一個專業的 GPU 技術顧問，專門幫助用戶解答關於顯卡的各種問題，包括性能比較、購買建議、技術規格、價格分析等。請用繁體中文回答，並盡量提供準確、實用的建議。'
        },
        {
          role: 'user',
          content: fullMessage
        }
      ],
      stream: true,
      max_tokens: 2000,
      temperature: 0.7
    };
    
    // 使用 fetch 調用 DeepSeek API
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API 錯誤:', response.status, errorText);
      res.write(`data: ${JSON.stringify({ 
        content: `API 調用失敗 (${response.status}): ${response.statusText}`, 
        done: true 
      })}\n\n`);
      res.end();
      return;
    }
    
    // 處理流式響應
    const reader = response.body;
    let buffer = '';
    let fullAiResponse = ''; // 收集完整的AI回應
    
    reader.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最後一行，可能不完整
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        
        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim();
          
          if (data === '[DONE]') {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
            return;
          }
          
          try {
            const parsedData = JSON.parse(data);
            if (parsedData.choices && parsedData.choices[0].delta && parsedData.choices[0].delta.content) {
              const content = parsedData.choices[0].delta.content;
              fullAiResponse += content; // 收集完整回應
              res.write(`data: ${JSON.stringify({ content: content })}\n\n`);
            }
          } catch (e) {
            console.warn('解析 DeepSeek 回應時發生錯誤:', e);
          }
        }
      }
    });
    
    reader.on('end', () => {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    });
    
    reader.on('error', (err) => {
      console.error('讀取 DeepSeek 回應時發生錯誤:', err);
      res.write(`data: ${JSON.stringify({ 
        content: '讀取回應時發生錯誤，請稍後再試。', 
        done: true 
      })}\n\n`);
      res.end();
    });
    
  } catch (error) {
    console.error('DeepSeek API 調用錯誤:', error);
    res.write(`data: ${JSON.stringify({ 
      content: `發生錯誤：${error.message}`, 
      done: true 
    })}\n\n`);
    res.end();
  }
});

/* 快取管理 API */
router.get('/api/cache/clear', async function(req, res, next) {
  try {
    const result = await new Promise((resolve, reject) => {
      clearExpiredCache((err, changes) => {
        if (err) {
          reject(err);
        } else {
          resolve(changes);
        }
      });
    });
    
    res.json({ 
      success: true, 
      message: `成功清理 ${result} 筆過期的快取記錄`,
      clearedCount: result
    });
  } catch (error) {
    console.error('清理快取時發生錯誤:', error);
    res.status(500).json({ 
      success: false, 
      error: '清理快取失敗',
      message: error.message
    });
  }
});

// 查看快取狀態 API
router.get('/api/cache/status', function(req, res, next) {
  const { db } = require('../database/db');
  
  // 查詢快取統計資訊
  const query = `
    SELECT 
      COUNT(*) as total_cache_entries,
      COUNT(CASE WHEN datetime(updated_at) > datetime('now', '-30 days') THEN 1 END) as valid_cache_entries,
      COUNT(CASE WHEN datetime(updated_at) <= datetime('now', '-30 days') THEN 1 END) as expired_cache_entries,
      MIN(updated_at) as oldest_cache,
      MAX(updated_at) as newest_cache
    FROM gpu_detail_cache
  `;
  
  db.get(query, [], (err, row) => {
    if (err) {
      console.error('查詢快取狀態時發生錯誤:', err);
      res.status(500).json({ error: '查詢快取狀態失敗' });
    } else {
      res.json({
        success: true,
        cache_statistics: {
          total_entries: row.total_cache_entries || 0,
          valid_entries: row.valid_cache_entries || 0,
          expired_entries: row.expired_cache_entries || 0,
          oldest_cache: row.oldest_cache,
          newest_cache: row.newest_cache
        }
      });
    }
  });
});

// GPU 詳細資訊頁面
router.get('/gpu-detail/:id', function(req, res) {
  const gpuId = req.params.id;
  res.sendFile('gpu-detail.html', { root: './public' });
});

// GPU 詳細資訊 API
router.get('/api/gpu-detail/:id', function(req, res) {
  const gpuId = req.params.id;
  
  // 嘗試從快取中獲取資料
  getGpuDetailFromCache(gpuId, (err, cacheRow) => {
    if (err) {
      console.error('從快取獲取 GPU 詳細資訊時發生錯誤:', err);
      return res.status(500).json({ error: '獲取 GPU 詳細資訊失敗' });
    }
    
    if (cacheRow) {
      // 如果快取存在且有效，直接返回快取資料
      const cacheDate = new Date(cacheRow.updated_at);
      const now = new Date();
      const daysDiff = (now - cacheDate) / (1000 * 60 * 60 * 24);
      
      if (daysDiff < 30) {
        console.log(`從快取返回 GPU ${gpuId} 的詳細資訊`);
        return res.json({
          id: cacheRow.id,
          name: cacheRow.name,
          url: cacheRow.source_url,
          content: cacheRow.detailed_content,
          cached: true
        });
      } else {
        console.log(`GPU ${gpuId} 的快取資料已過期，需要重新抓取`);
      }
    }
    
    // 如果快取不存在或已過期，從資料庫獲取資料
    getGPUById(gpuId, (err, gpuRow) => {
      if (err) {
        console.error('從資料庫獲取 GPU 詳細資訊時發生錯誤:', err);
        return res.status(500).json({ error: '獲取 GPU 詳細資訊失敗' });
      }
      
      if (!gpuRow) {
        return res.status(404).json({ error: '找不到該 GPU 的詳細資訊' });
      }
      
      // 抓取詳細資訊並更新快取
      const gpu = {
        id: gpuRow.id,
        name: gpuRow.name,
        url: gpuRow.source_url
      };
      
      // 嘗試抓取網頁內容
      axios.get(gpu.url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      }).then(response => {
        const $ = cheerio.load(response.data);
        
        // 優化的內容提取邏輯 - 專門針對 TechPowerUp 網站結構
        $('script, style, nav, header, footer, .sidebar, .advertisement, .ad, .menu, .navigation').remove();
        
        // 嘗試找到主要內容區域
        let detailContent = '';
        const contentSelectors = [
          '.content',
          '#content', 
          '.main-content',
          '.specs',
          '.specification',
          '.techspecs',
          '.gpu-specs'
        ];
        
        let mainContent = null;
        for (const selector of contentSelectors) {
          const element = $(selector);
          if (element.length > 0 && element.text().trim().length > 100) {
            mainContent = element;
            break;
          }
        }
        
        if (mainContent) {
          detailContent = mainContent.text();
        } else {
          // 如果找不到特定內容區域，提取 body 文字但過濾掉導航等
          detailContent = $('body').text();
        }
        
        // 清理和格式化內容
        detailContent = detailContent
          .replace(/\s+/g, ' ')                    // 將多個空白字符替換為單個空格
          .replace(/\n+/g, '\n')                   // 將多個換行符替換為單個換行符
          .replace(/[\r\t]/g, ' ')                 // 移除回車符和制表符
          .replace(/JavaScript is disabled|Please enable JavaScript|Cookie|Privacy Policy|Terms of Service/gi, '') // 秘除常見的無用文字
          .trim();                                 // 移除首尾空白
        
        // 限制內容長度避免過長
        if (detailContent.length > 8000) {
          detailContent = detailContent.substring(0, 8000) + '...';
        }
        
        // 如果內容太短，可能抓取失敗
        if (detailContent.length < 100) {
          console.log(`GPU ${gpu.name} 抓取的內容太短，可能抓取失敗`);
          detailContent = `GPU 名稱: ${gpu.name}\n來源網址: ${gpu.source_url}\n注意：詳細規格資料抓取失敗，請參考原始網址。`;
        }
        
        // 將新抓取的資料存入快取
        try {
          saveGpuDetailToCache(gpu.id, gpu.name, gpu.source_url, detailContent, (err, result) => {
            if (err) {
              console.error(`儲存 GPU ${gpu.name} 快取時發生錯誤:`, err);
            } else {
              console.log(`成功儲存 GPU ${gpu.name} 到快取`);
            }
          });
        } catch (cacheError) {
          console.error(`儲存快取失敗，但繼續執行:`, cacheError);
        }
        
        console.log(`成功獲取 ${gpu.name} 的詳細資訊，內容長度: ${detailContent.length}`);
        return res.json({
          id: gpu.id,
          name: gpu.name,
          url: gpu.source_url,
          content: detailContent,
          cached: false
        });
        
      }).catch(err => {
        console.error(`抓取 GPU ${gpu.name} 詳細資訊時發生錯誤:`, err.message);
        return res.status(500).json({ error: '獲取 GPU 詳細資訊失敗' });
      });
    });
  });
});

// 獲取 GPU 詳細資訊的函數（帶快取機制）
async function getGpuDetailedInfo(gpuIds) {
  try {
    console.log('正在獲取 GPU 詳細資訊，GPU IDs:', gpuIds);
    
    // 從資料庫獲取 GPU 資訊
    const gpuInfoPromises = gpuIds.map(async (id) => {
      try {
        console.log(`獲取 GPU ID ${id} 詳細資訊`);
        
        const gpu = await new Promise((resolve, reject) => {
          getGPUById(id, (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row);
            }
          });
        });
        
        if (!gpu || !gpu.source_url) {
          console.log(`GPU ID ${id} 沒有找到或沒有 source_url`);
          return null;
        }
        
        // 檢查快取中是否有資料
        const cacheData = await new Promise((resolve, reject) => {
          getGpuDetailFromCache(gpu.id, (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row);
            }
          });
        });
        
        // 檢查快取是否有效（30天內）
        if (cacheData) {
          const cacheDate = new Date(cacheData.updated_at);
          const now = new Date();
          const daysDiff = (now - cacheDate) / (1000 * 60 * 60 * 24);
          
          if (daysDiff < 30) {
            console.log(`使用 GPU ${gpu.name} 的快取資料，快取時間: ${cacheData.updated_at}`);
            return {
              name: gpu.name,
              url: gpu.source_url,
              content: cacheData.detailed_content
            };
          } else {
            console.log(`GPU ${gpu.name} 的快取資料已過期，需要重新抓取`);
          }
        }
        
        console.log(`正在抓取 GPU ${gpu.name} 的詳細資訊，URL: ${gpu.source_url}`);
        
        // 抓取網頁內容
        const response = await axios.get(gpu.source_url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        const $ = cheerio.load(response.data);
        
        // 優化的內容提取邏輯 - 專門針對 TechPowerUp 網站結構
        $('script, style, nav, header, footer, .sidebar, .advertisement, .ad, .menu, .navigation').remove();
        
        // 嘗試找到主要內容區域
        let detailContent = '';
        const contentSelectors = [
          '.content',
          '#content', 
          '.main-content',
          '.specs',
          '.specification',
          '.techspecs',
          '.gpu-specs'
        ];
        
        let mainContent = null;
        for (const selector of contentSelectors) {
          const element = $(selector);
          if (element.length > 0 && element.text().trim().length > 100) {
            mainContent = element;
            break;
          }
        }
        
        if (mainContent) {
          detailContent = mainContent.text();
        } else {
          // 如果找不到特定內容區域，提取 body 文字但過濾掉導航等
          detailContent = $('body').text();
        }
        
        // 清理和格式化內容
        detailContent = detailContent
          .replace(/\s+/g, ' ')                    // 將多個空白字符替換為單個空格
          .replace(/\n+/g, '\n')                   // 將多個換行符替換為單個換行符
          .replace(/[\r\t]/g, ' ')                 // 移除回車符和制表符
          .replace(/JavaScript is disabled|Please enable JavaScript|Cookie|Privacy Policy|Terms of Service/gi, '') // 秘除常見的無用文字
          .trim();                                 // 移除首尾空白
        
        // 限制內容長度避免過長
        if (detailContent.length > 8000) {
          detailContent = detailContent.substring(0, 8000) + '...';
        }
        
        // 如果內容太短，可能抓取失敗
        if (detailContent.length < 100) {
          console.log(`GPU ${gpu.name} 抓取的內容太短，可能抓取失敗`);
          detailContent = `GPU 名稱: ${gpu.name}\n來源網址: ${gpu.source_url}\n注意：詳細規格資料抓取失敗，請參考原始網址。`;
        }
        
        // 將新抓取的資料存入快取
        try {
          await new Promise((resolve, reject) => {
            saveGpuDetailToCache(gpu.id, gpu.name, gpu.source_url, detailContent, (err, result) => {
              if (err) {
                console.error(`儲存 GPU ${gpu.name} 快取時發生錯誤:`, err);
                reject(err);
              } else {
                console.log(`成功儲存 GPU ${gpu.name} 到快取`);
                resolve(result);
              }
            });
          });
        } catch (cacheError) {
          console.error(`儲存快取失敗，但繼續執行:`, cacheError);
        }
        
        console.log(`成功獲取 ${gpu.name} 的詳細資訊，內容長度: ${detailContent.length}`);
        console.log(`=== ${gpu.name} 抓取到的內容 ===`);
        console.log(detailContent.substring(0, 500) + (detailContent.length > 500 ? '...(更多內容)' : ''));
        console.log(`=== 內容結束 ===`);
        
        return {
          name: gpu.name,
          url: gpu.source_url,
          content: detailContent
        };
        
      } catch (error) {
        console.error(`獲取 GPU ID ${id} 詳細資訊時發生錯誤:`, error.message);
        return null;
      }
    });
    
    const gpuInfoResults = await Promise.all(gpuInfoPromises);
    const validResults = gpuInfoResults.filter(result => result !== null);
    
    if (validResults.length === 0) {
      return '';
    }
    
    // 構建完整的 GPU 資訊字串
    let contextInfo = '=== 選中的 GPU 詳細技術規格資訊 ===\n\n';
    
    validResults.forEach((gpu, index) => {
      contextInfo += `${index + 1}. ${gpu.name}\n`;
      contextInfo += `資料來源: ${gpu.url}\n`;
      contextInfo += `詳細規格:\n${gpu.content}\n`;
      contextInfo += '\n' + '='.repeat(50) + '\n\n';
    });
    
    console.log(`成功獲取 ${validResults.length} 個 GPU 的詳細資訊`);
    return contextInfo;
    
  } catch (error) {
    console.error('獲取 GPU 詳細資訊時發生錯誤:', error);
    return '';
  }
}

/* GET Chat History Management page */
router.get('/chat-history', function(req, res, next) {
  res.sendFile('chat-history.html', { root: './public' });
});

/* Chat History Management API - 需要密碼驗證 */
router.post('/api/chat-history/auth', function(req, res, next) {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'; // 從環境變數讀取密碼
  
  if (password === adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: '密碼錯誤' });
  }
});

/* Get all chat history */
router.get('/api/chat-history', function(req, res, next) {
  getAllChatSessions((err, rows) => {
    if (err) {
      console.error('獲取對話記錄失敗:', err);
      res.status(500).json({ error: '獲取對話記錄失敗' });
    } else {
      res.json(rows || []);
    }
  });
});

/* Save chat session API - 保存完整的會話 */
router.post('/api/save-chat-session', function(req, res, next) {
  const { sessionId, selectedGpus, conversationData } = req.body;
  
  if (!sessionId || !conversationData) {
    return res.status(400).json({ error: '會話ID和對話資料不能為空' });
  }
  
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  // 保存會話到資料庫
  saveChatSession(sessionId, clientIP, selectedGpus || [], conversationData, (err, id) => {
    if (err) {
      console.error('保存會話失敗:', err);
      res.status(500).json({ error: '保存會話失敗' });
    } else {
      console.log(`會話 ${sessionId} 已成功保存，資料庫ID: ${id}`);
      res.json({ success: true, sessionId: sessionId, dbId: id });
    }
  });
});

/* Delete chat history */
router.delete('/api/chat-history/:id', function(req, res, next) {
  const { id } = req.params;
  
  deleteChatSession(id, (err, changes) => {
    if (err) {
      console.error('刪除對話記錄失敗:', err);
      res.status(500).json({ error: '刪除對話記錄失敗' });
    } else {
      res.json({ success: true, deleted: changes });
    }
  });
});

/* Delete all chat history */
router.delete('/api/chat-history', function(req, res, next) {
  deleteAllChatSessions((err, changes) => {
    if (err) {
      console.error('清空所有對話記錄失敗:', err);
      res.status(500).json({ error: '清空所有對話記錄失敗' });
    } else {
      console.log(`已清空所有對話記錄，共刪除 ${changes} 條記錄`);
      res.json({ success: true, deleted: changes, message: `已成功清空所有記錄，共刪除 ${changes} 條記錄` });
    }
  });
});

module.exports = router;
