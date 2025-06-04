const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { initDatabase, insertGPU, closeDatabase } = require('./database/db');

// 初始化資料庫
initDatabase();

const csvFilePath = path.join(__dirname, 'techpowerup_gpu_incremental.csv');

console.log('開始匯入 CSV 資料...');

// 讀取並匯入 CSV 資料
fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (row) => {
        // 處理數據，清理可能的空值
        const gpuData = {
            brand: row.brand || '',
            name: row.name || '',
            release_year: row.release_year ? parseInt(row.release_year) : null,
            launch_price: row.launch_price ? parseFloat(row.launch_price) : null,
            pixel_rate: row.pixel_rate || '',
            texture_rate: row.texture_rate || '',
            fp16: row.fp16 || '',
            fp32: row.fp32 || '',
            fp64: row.fp64 || '',
            memory_size: row.memory_size || '',
            source_url: row.source_url || ''
        };

        // 插入資料庫
        insertGPU(gpuData, (err, lastID) => {
            if (err) {
                console.error('Error inserting GPU:', err.message);
            } else {
                console.log(`已匯入 GPU: ${gpuData.brand} ${gpuData.name} (ID: ${lastID})`);
            }
        });
    })
    .on('end', () => {
        console.log('CSV 資料匯入完成！');
        // 延遲關閉資料庫，確保所有插入操作都完成
        setTimeout(() => {
            closeDatabase();
        }, 1000);
    })
    .on('error', (err) => {
        console.error('Error reading CSV file:', err);
    });
