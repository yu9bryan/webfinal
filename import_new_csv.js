const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { initDatabase, insertGPU, closeDatabase, db } = require('./database/db');

// 初始化資料庫
initDatabase();

const csvFilePath = path.join(__dirname, 'techpowerup_gpu_incrementalAMD.csv');

console.log('開始新增資料到資料庫，使用新的 CSV 資料...');

// 查詢現有資料數量
db.get('SELECT COUNT(*) as count FROM gpus', (err, row) => {
    if (err) {
        console.error('Error counting existing data:', err.message);
        return;
    }
    console.log(`目前資料庫中有 ${row.count} 筆 GPU 資料`);
    console.log('開始匯入新的 CSV 資料...');
    
    let rowCount = 0;
    let insertedCount = 0;
    let errorCount = 0;
    
    // 讀取並匯入新的 CSV 資料
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
            rowCount++;
            
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

            // 檢查是否已存在相同的 GPU（根據品牌和名稱）
            db.get('SELECT id FROM gpus WHERE brand = ? AND name = ?', [gpuData.brand, gpuData.name], (err, existingRow) => {
                if (err) {
                    console.error('Error checking existing GPU:', err.message);
                    errorCount++;
                    return;
                }
                
                if (existingRow) {
                    console.log(`跳過重複的 GPU: ${gpuData.brand} ${gpuData.name} (已存在 ID: ${existingRow.id})`);
                } else {
                    // 插入新的 GPU 資料
                    insertGPU(gpuData, (err, lastID) => {
                        if (err) {
                            console.error('Error inserting GPU:', err.message);
                            errorCount++;
                        } else {
                            insertedCount++;
                            console.log(`已新增 GPU: ${gpuData.brand} ${gpuData.name} (ID: ${lastID})`);
                        }
                    });
                }
            });
        })
        .on('end', () => {
            console.log(`CSV 資料處理完成！總共處理了 ${rowCount} 筆資料`);
            
            // 延遲查詢總筆數並關閉資料庫
            setTimeout(() => {
                db.get('SELECT COUNT(*) as count FROM gpus', (err, row) => {
                    if (err) {
                        console.error('Error counting records:', err.message);
                    } else {
                        console.log(`資料庫中現在有 ${row.count} 筆 GPU 資料`);
                        console.log(`本次新增了 ${insertedCount} 筆新資料`);
                        if (errorCount > 0) {
                            console.log(`處理過程中有 ${errorCount} 筆資料發生錯誤`);
                        }
                    }
                    closeDatabase();
                });
            }, 3000); // 增加延遲時間確保所有異步操作完成
        })
        .on('error', (err) => {
            console.error('Error reading CSV file:', err);
            closeDatabase();
        });
});
