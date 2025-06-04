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

// 初始化資料庫
const initDatabase = () => {
    createTable();
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
    searchGPUs,
    insertGPU,
    closeDatabase
};
