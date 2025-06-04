const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 建立資料庫連線
const dbPath = path.join(__dirname, 'database', 'gpu_database.db');
const db = new sqlite3.Database(dbPath);

console.log('=== GPU 資料庫快速去重工具 ===\n');

// 步驟 1: 檢查重複數量
function checkDuplicates() {
    return new Promise((resolve) => {
        console.log('1. 檢查完全重複的記錄...');
          const sql = `
            SELECT COUNT(*) as total_records,
                   COUNT(*) - COUNT(DISTINCT brand || '|' || name || '|' || 
                                   COALESCE(release_year,'') || '|' || COALESCE(launch_price,'') || '|' || 
                                   COALESCE(pixel_rate,'') || '|' || COALESCE(texture_rate,'') || '|' || 
                                   COALESCE(fp16,'') || '|' || COALESCE(fp32,'') || '|' || COALESCE(fp64,'') || '|' || 
                                   COALESCE(memory_size,'') || '|' || COALESCE(source_url,'')) as exact_duplicates
            FROM gpus
        `;
        
        db.get(sql, [], (err, row) => {
            if (err) {
                console.error('檢查失敗:', err.message);
                resolve({ total: 0, duplicates: 0 });
            } else {
                console.log(`   總記錄數: ${row.total_records}`);
                console.log(`   完全重複: ${row.exact_duplicates} 筆`);
                resolve({ total: row.total_records, duplicates: row.exact_duplicates });
            }
        });
    });
}

// 步驟 2: 檢查相同名稱的記錄
function checkNameDuplicates() {
    return new Promise((resolve) => {
        console.log('\n2. 檢查相同名稱的記錄...');
        
        const sql = `
            SELECT COUNT(*) as duplicate_names
            FROM (
                SELECT name, COUNT(*) as cnt
                FROM gpus
                GROUP BY name
                HAVING cnt > 1
            )
        `;
        
        db.get(sql, [], (err, row) => {
            if (err) {
                console.error('檢查失敗:', err.message);
                resolve(0);
            } else {
                console.log(`   重複名稱組數: ${row.duplicate_names}`);
                resolve(row.duplicate_names);
            }
        });
    });
}

// 步驟 3: 刪除完全重複的記錄
function removeExactDuplicates() {
    return new Promise((resolve) => {
        console.log('\n3. 刪除完全重複的記錄...');
        
        const sql = `
            DELETE FROM gpus 
            WHERE rowid NOT IN (
                SELECT MIN(rowid)
                FROM gpus 
                GROUP BY brand, name, release_year, launch_price, pixel_rate, texture_rate, 
                         fp16, fp32, fp64, memory_size, source_url
            )
        `;
        
        db.run(sql, [], function(err) {
            if (err) {
                console.error('刪除失敗:', err.message);
                resolve(0);
            } else {
                console.log(`   已刪除: ${this.changes} 筆完全重複的記錄`);
                resolve(this.changes);
            }
        });
    });
}

// 步驟 4: 處理相同名稱的記錄（保留最佳記錄）
function removeNameDuplicates() {
    return new Promise((resolve) => {
        console.log('\n4. 處理相同名稱的重複記錄...');
        
        // 保留規則：
        // 1. 優先保留有價格的記錄
        // 2. 優先保留 NVIDIA 品牌
        // 3. 優先保留較早的 ID（通常是較早匯入的）
        const sql = `
            DELETE FROM gpus 
            WHERE rowid NOT IN (
                SELECT rowid FROM (
                    SELECT rowid,
                           ROW_NUMBER() OVER (
                               PARTITION BY name 
                               ORDER BY 
                                   CASE WHEN launch_price IS NOT NULL AND launch_price > 0 THEN 0 ELSE 1 END,
                                   CASE WHEN LOWER(brand) LIKE '%nvidia%' THEN 0 ELSE 1 END,
                                   rowid
                           ) as rn
                    FROM gpus
                ) ranked
                WHERE rn = 1
            )
        `;
        
        db.run(sql, [], function(err) {
            if (err) {
                console.error('刪除失敗:', err.message);
                resolve(0);
            } else {
                console.log(`   已刪除: ${this.changes} 筆名稱重複的記錄`);
                resolve(this.changes);
            }
        });
    });
}

// 步驟 5: 顯示最終統計
function showFinalStats() {
    return new Promise((resolve) => {
        console.log('\n5. 最終統計...');
        
        const queries = [
            "SELECT COUNT(*) as count FROM gpus",
            "SELECT COUNT(*) as count FROM gpus WHERE LOWER(brand) LIKE '%nvidia%'",
            "SELECT COUNT(*) as count FROM gpus WHERE LOWER(brand) LIKE '%amd%'",
            "SELECT COUNT(*) as count FROM gpus WHERE launch_price IS NOT NULL AND launch_price > 0"
        ];
        
        const labels = ['總記錄數', 'NVIDIA GPU', 'AMD GPU', '有價格資料'];
        let completed = 0;
        
        queries.forEach((sql, index) => {
            db.get(sql, [], (err, row) => {
                if (!err) {
                    console.log(`   ${labels[index]}: ${row.count.toLocaleString()}`);
                }
                completed++;
                if (completed === queries.length) {
                    resolve();
                }
            });
        });
    });
}

// 主要執行函數
async function main() {
    try {
        // 檢查重複情況
        const exactDupInfo = await checkDuplicates();
        const nameDupCount = await checkNameDuplicates();
        
        if (exactDupInfo.duplicates === 0 && nameDupCount === 0) {
            console.log('\n✅ 沒有發現重複資料！');
            db.close();
            return;
        }
        
        console.log('\n開始清理重複資料...');
        
        // 執行清理
        const exactRemoved = await removeExactDuplicates();
        const nameRemoved = await removeNameDuplicates();
        
        // 顯示結果
        await showFinalStats();
        
        const totalRemoved = exactRemoved + nameRemoved;
        console.log(`\n✅ 去重完成！總共刪除了 ${totalRemoved.toLocaleString()} 筆重複記錄`);
        
    } catch (error) {
        console.error('❌ 處理過程中發生錯誤:', error.message);
    } finally {
        db.close();
    }
}

// 執行主程式
main();
