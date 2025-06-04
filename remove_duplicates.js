const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 建立資料庫連線
const dbPath = path.join(__dirname, 'database', 'gpu_database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    } else {
        console.log('Connected to the SQLite database for deduplication.');
    }
});

class DatabaseDeduplicator {
    constructor() {
        this.duplicatesFound = 0;
        this.duplicatesRemoved = 0;
    }

    // 檢查重複資料
    async checkDuplicates() {
        return new Promise((resolve, reject) => {
            console.log('\n=== 檢查重複資料 ===');
            
            // 檢查完全相同的記錄（除了 ID）
            const sqlExactDuplicates = `
                SELECT brand, name, release_year, launch_price, pixel_rate, texture_rate, 
                       fp16, fp32, fp64, memory_size, source_url, COUNT(*) as count
                FROM gpus 
                GROUP BY brand, name, release_year, launch_price, pixel_rate, texture_rate, 
                         fp16, fp32, fp64, memory_size, source_url
                HAVING count > 1
                ORDER BY count DESC
            `;

            db.all(sqlExactDuplicates, [], (err, exactDuplicates) => {
                if (err) {
                    reject(err);
                    return;
                }

                console.log(`發現 ${exactDuplicates.length} 組完全重複的記錄：`);
                exactDuplicates.forEach((row, index) => {
                    console.log(`${index + 1}. ${row.brand} ${row.name} (${row.count} 筆重複)`);
                });

                // 檢查相同名稱的記錄
                const sqlNameDuplicates = `
                    SELECT name, COUNT(*) as count, GROUP_CONCAT(id) as ids
                    FROM gpus 
                    GROUP BY name
                    HAVING count > 1
                    ORDER BY count DESC
                `;

                db.all(sqlNameDuplicates, [], (err, nameDuplicates) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    console.log(`\n發現 ${nameDuplicates.length} 組相同名稱的記錄：`);
                    nameDuplicates.slice(0, 10).forEach((row, index) => {
                        console.log(`${index + 1}. "${row.name}" (${row.count} 筆)`);
                    });

                    resolve({
                        exactDuplicates,
                        nameDuplicates
                    });
                });
            });
        });
    }

    // 刪除完全重複的記錄（保留最小 ID 的記錄）
    async removeExactDuplicates() {
        return new Promise((resolve, reject) => {
            console.log('\n=== 刪除完全重複的記錄 ===');
            
            const sql = `
                DELETE FROM gpus 
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM gpus 
                    GROUP BY brand, name, release_year, launch_price, pixel_rate, texture_rate, 
                             fp16, fp32, fp64, memory_size, source_url
                )
            `;

            db.run(sql, [], function(err) {
                if (err) {
                    reject(err);
                    return;
                }

                const deletedCount = this.changes;
                console.log(`已刪除 ${deletedCount} 筆完全重複的記錄`);
                this.duplicatesRemoved += deletedCount;
                resolve(deletedCount);
            }.bind(this));
        });
    }

    // 刪除相同名稱但不同品牌的重複記錄（優先保留 NVIDIA，其次 AMD）
    async removeNameDuplicatesWithBrandPriority() {
        return new Promise((resolve, reject) => {
            console.log('\n=== 刪除相同名稱的重複記錄（優先保留主要品牌） ===');
            
            // 先找出所有相同名稱的群組
            const findDuplicatesSQL = `
                SELECT name, COUNT(*) as count
                FROM gpus 
                GROUP BY name
                HAVING count > 1
            `;

            db.all(findDuplicatesSQL, [], (err, duplicateGroups) => {
                if (err) {
                    reject(err);
                    return;
                }

                console.log(`處理 ${duplicateGroups.length} 組相同名稱的記錄...`);
                
                let processedGroups = 0;
                let totalDeleted = 0;

                if (duplicateGroups.length === 0) {
                    console.log('沒有發現相同名稱的重複記錄');
                    resolve(0);
                    return;
                }

                duplicateGroups.forEach(group => {
                    // 對每個重複群組，保留優先級最高的記錄
                    const cleanupSQL = `
                        DELETE FROM gpus 
                        WHERE name = ? AND id NOT IN (
                            SELECT id FROM (
                                SELECT id,
                                       CASE 
                                           WHEN LOWER(brand) LIKE '%nvidia%' THEN 1
                                           WHEN LOWER(brand) LIKE '%amd%' THEN 2
                                           ELSE 3
                                       END as priority,
                                       launch_price
                                FROM gpus 
                                WHERE name = ?
                                ORDER BY priority ASC, 
                                         CASE WHEN launch_price IS NOT NULL AND launch_price > 0 THEN 0 ELSE 1 END ASC,
                                         id ASC
                                LIMIT 1
                            ) as keeper
                        )
                    `;

                    db.run(cleanupSQL, [group.name, group.name], function(err) {
                        if (err) {
                            console.error(`處理 "${group.name}" 時發生錯誤:`, err.message);
                        } else {
                            const deleted = this.changes;
                            if (deleted > 0) {
                                console.log(`- "${group.name}": 刪除了 ${deleted} 筆重複記錄`);
                                totalDeleted += deleted;
                            }
                        }

                        processedGroups++;
                        if (processedGroups === duplicateGroups.length) {
                            console.log(`總共刪除了 ${totalDeleted} 筆名稱重複的記錄`);
                            resolve(totalDeleted);
                        }
                    });
                });
            });
        });
    }

    // 顯示資料庫統計資訊
    async showStats() {
        return new Promise((resolve, reject) => {
            console.log('\n=== 資料庫統計資訊 ===');
            
            const queries = [
                {
                    name: '總記錄數',
                    sql: 'SELECT COUNT(*) as count FROM gpus'
                },
                {
                    name: 'NVIDIA GPU 數量',
                    sql: "SELECT COUNT(*) as count FROM gpus WHERE LOWER(brand) LIKE '%nvidia%'"
                },
                {
                    name: 'AMD GPU 數量',
                    sql: "SELECT COUNT(*) as count FROM gpus WHERE LOWER(brand) LIKE '%amd%'"
                },
                {
                    name: '有價格資料的 GPU',
                    sql: 'SELECT COUNT(*) as count FROM gpus WHERE launch_price IS NOT NULL AND launch_price > 0'
                },
                {
                    name: '有年份資料的 GPU',
                    sql: 'SELECT COUNT(*) as count FROM gpus WHERE release_year IS NOT NULL AND release_year > 2000'
                }
            ];

            let completed = 0;
            const results = {};

            queries.forEach(query => {
                db.get(query.sql, [], (err, row) => {
                    if (err) {
                        console.error(`查詢 "${query.name}" 失敗:`, err.message);
                    } else {
                        results[query.name] = row.count;
                        console.log(`${query.name}: ${row.count.toLocaleString()}`);
                    }

                    completed++;
                    if (completed === queries.length) {
                        resolve(results);
                    }
                });
            });
        });
    }

    // 主要執行函數
    async execute() {
        try {
            console.log('開始資料庫去重處理...\n');

            // 顯示處理前的統計
            console.log('=== 處理前統計 ===');
            await this.showStats();

            // 檢查重複資料
            const duplicateInfo = await this.checkDuplicates();

            if (duplicateInfo.exactDuplicates.length === 0 && duplicateInfo.nameDuplicates.length === 0) {
                console.log('\n✅ 沒有發現重複資料！');
                return;
            }

            // 詢問用戶是否要繼續
            console.log('\n是否要繼續刪除重複資料？');
            console.log('1. 刪除完全重複的記錄');
            console.log('2. 刪除相同名稱的重複記錄（保留主要品牌）');
            console.log('3. 兩者都執行');
            console.log('4. 僅查看，不刪除');
            
            // 為了自動化，這裡執行選項 3（兩者都執行）
            console.log('\n自動執行完整去重處理...');

            // 刪除完全重複的記錄
            await this.removeExactDuplicates();

            // 刪除相同名稱的重複記錄
            await this.removeNameDuplicatesWithBrandPriority();

            // 顯示處理後的統計
            console.log('\n=== 處理後統計 ===');
            await this.showStats();

            console.log(`\n✅ 去重完成！總共刪除了 ${this.duplicatesRemoved} 筆重複記錄`);

        } catch (error) {
            console.error('❌ 去重處理過程中發生錯誤:', error.message);
            throw error;
        }
    }

    // 關閉資料庫連線
    close() {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed.');
            }
        });
    }
}

// 如果直接執行此檔案
if (require.main === module) {
    const deduplicator = new DatabaseDeduplicator();
    
    deduplicator.execute()
        .then(() => {
            console.log('\n去重處理完成');
        })
        .catch((error) => {
            console.error('去重處理失敗:', error);
        })
        .finally(() => {
            deduplicator.close();
            process.exit(0);
        });
}

module.exports = DatabaseDeduplicator;
