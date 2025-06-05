const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 建立資料庫連線
const dbPath = path.join(__dirname, 'gpu_database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// 建立 GPU 資料表
const createTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS gpus (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand TEXT NOT NULL,
            name TEXT NOT NULL,
            release_year INTEGER,
            launch_price REAL,
            pixel_rate TEXT,
            texture_rate TEXT,
            fp16 TEXT,
            fp32 TEXT,
            fp64 TEXT,
            memory_size TEXT,
            source_url TEXT
        )
    `;
    
    db.run(sql, (err) => {
        if (err) {
            console.error('Error creating table:', err.message);
        } else {
            console.log('GPU table created successfully.');
        }
    });
};

// 建立 AI 對話記錄表
const createChatHistoryTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL UNIQUE,
            user_ip TEXT,
            selected_gpus TEXT,
            conversation_data TEXT NOT NULL,
            message_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.run(sql, (err) => {
        if (err) {
            console.error('Error creating chat sessions table:', err.message);
        } else {
            console.log('Chat sessions table created successfully.');
        }
    });
};

// 建立 GPU 詳細資料快取表
const createGpuCacheTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS gpu_detail_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gpu_id INTEGER NOT NULL,
            gpu_name TEXT NOT NULL,
            source_url TEXT NOT NULL,
            detailed_content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (gpu_id) REFERENCES gpus (id),
            UNIQUE(gpu_id)
        )
    `;
    
    db.run(sql, (err) => {
        if (err) {
            console.error('Error creating GPU cache table:', err.message);
        } else {
            console.log('GPU detail cache table created successfully.');
        }
    });
};

// 初始化資料庫
const initDatabase = () => {
    createTable();
    createChatHistoryTable();
    createGpuCacheTable();
};

// 查詢所有 GPU
const getAllGPUs = (callback) => {
    const sql = 'SELECT * FROM gpus ORDER BY release_year DESC, brand, name';
    db.all(sql, [], (err, rows) => {
        if (err) {
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
};

// 根據品牌查詢 GPU
const getGPUsByBrand = (brand, callback) => {
    const sql = 'SELECT * FROM gpus WHERE brand = ? ORDER BY release_year DESC, name';
    db.all(sql, [brand], (err, rows) => {
        if (err) {
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
};

// 根據年份範圍查詢 GPU
const getGPUsByYearRange = (startYear, endYear, callback) => {
    const sql = 'SELECT * FROM gpus WHERE release_year BETWEEN ? AND ? ORDER BY release_year DESC, brand, name';
    db.all(sql, [startYear, endYear], (err, rows) => {
        if (err) {
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
};

// 根據 ID 查詢特定 GPU
const getGPUById = (id, callback) => {
    const sql = 'SELECT * FROM gpus WHERE id = ?';
    db.get(sql, [id], (err, row) => {
        if (err) {
            callback(err, null);
        } else {
            callback(null, row);
        }
    });
};

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

// 新增 GPU 資料
const insertGPU = (gpuData, callback) => {
    const sql = `
        INSERT INTO gpus (brand, name, release_year, launch_price, pixel_rate, texture_rate, fp16, fp32, fp64, memory_size, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(sql, [
        gpuData.brand,
        gpuData.name,
        gpuData.release_year,
        gpuData.launch_price,
        gpuData.pixel_rate,
        gpuData.texture_rate,
        gpuData.fp16,
        gpuData.fp32,
        gpuData.fp64,
        gpuData.memory_size,
        gpuData.source_url
    ], function(err) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, this.lastID);
        }
    });
};

// AI 對話記錄相關函數

// 保存或更新對話會話
const saveChatSession = (sessionId, userIP, selectedGpus, conversationData, callback) => {
    const sql = `
        INSERT OR REPLACE INTO chat_sessions (session_id, user_ip, selected_gpus, conversation_data, message_count, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    const selectedGpusJson = JSON.stringify(selectedGpus || []);
    const conversationJson = JSON.stringify(conversationData);
    const messageCount = conversationData.length;
    
    db.run(sql, [sessionId, userIP, selectedGpusJson, conversationJson, messageCount], function(err) {
        if (err) {
            console.error('保存會話失敗:', err);
            callback(err, null);
        } else {
            console.log(`會話 ${sessionId} 已保存，資料庫ID: ${this.lastID}`);
            callback(null, this.lastID);
        }
    });
};

// 獲取所有對話會話
const getAllChatSessions = (callback) => {
    const sql = `
        SELECT id, session_id, user_ip, selected_gpus, conversation_data, message_count,
               datetime(created_at, 'localtime') as created_at,
               datetime(updated_at, 'localtime') as updated_at
        FROM chat_sessions 
        ORDER BY updated_at DESC
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            callback(err, null);
        } else {
            // 解析JSON資料
            const parsedRows = rows.map(row => ({
                ...row,
                selected_gpus: JSON.parse(row.selected_gpus || '[]'),
                conversation_data: JSON.parse(row.conversation_data || '[]')
            }));
            callback(null, parsedRows);
        }
    });
};

// 根據會話ID獲取對話記錄
const getChatSessionById = (sessionId, callback) => {
    const sql = `
        SELECT id, session_id, user_ip, selected_gpus, conversation_data, message_count,
               datetime(created_at, 'localtime') as created_at,
               datetime(updated_at, 'localtime') as updated_at
        FROM chat_sessions 
        WHERE session_id = ?
    `;
    
    db.get(sql, [sessionId], (err, row) => {
        if (err) {
            callback(err, null);
        } else if (row) {
            // 解析JSON資料
            const parsedRow = {
                ...row,
                selected_gpus: JSON.parse(row.selected_gpus || '[]'),
                conversation_data: JSON.parse(row.conversation_data || '[]')
            };
            callback(null, parsedRow);
        } else {
            callback(null, null);
        }
    });
};

// 刪除對話會話
const deleteChatSession = (id, callback) => {
    const sql = 'DELETE FROM chat_sessions WHERE id = ?';
    
    db.run(sql, [id], function(err) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, this.changes);
        }
    });
};

// 刪除所有對話會話
const deleteAllChatSessions = (callback) => {
    const sql = 'DELETE FROM chat_sessions';
    
    db.run(sql, [], function(err) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, this.changes);
        }
    });
};

// GPU 詳細資料快取相關函數

// 檢查快取中是否存在 GPU 詳細資料
const getGpuDetailFromCache = (gpuId, callback) => {
    const sql = 'SELECT * FROM gpu_detail_cache WHERE gpu_id = ?';
    db.get(sql, [gpuId], (err, row) => {
        if (err) {
            callback(err, null);
        } else {
            callback(null, row);
        }
    });
};

// 將 GPU 詳細資料儲存到快取
const saveGpuDetailToCache = (gpuId, gpuName, sourceUrl, detailedContent, callback) => {
    // 使用簡單的 hash 來檢查內容是否有變化
    const crypto = require('crypto');
    const contentHash = crypto.createHash('md5').update(detailedContent).digest('hex');
    
    const sql = `
        INSERT OR REPLACE INTO gpu_detail_cache 
        (gpu_id, gpu_name, source_url, detailed_content, content_hash, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    db.run(sql, [gpuId, gpuName, sourceUrl, detailedContent, contentHash], function(err) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, this.lastID);
        }
    });
};

// 清除過期的快取資料（超過30天）
const clearExpiredCache = (callback) => {
    const sql = `
        DELETE FROM gpu_detail_cache 
        WHERE updated_at < datetime('now', '-30 days')
    `;
    
    db.run(sql, [], function(err) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, this.changes);
        }
    });
};

// 關閉資料庫連線
const closeDatabase = () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
    });
};

module.exports = {
    db,
    initDatabase,
    getAllGPUs,
    getGPUsByBrand,
    getGPUsByYearRange,
    getGPUById,
    searchGPUs,
    insertGPU,
    getGpuDetailFromCache,
    saveGpuDetailToCache,
    clearExpiredCache,
    closeDatabase,
    saveChatSession,
    getAllChatSessions,
    getChatSessionById,
    deleteChatSession,
    deleteAllChatSessions
};
