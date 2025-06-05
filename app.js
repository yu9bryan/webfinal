require('dotenv').config();
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const { initDatabase, clearExpiredCache } = require('./database/db');

var app = express();

// 配置信任代理以正確獲取客戶端 IP
app.set('trust proxy', true);

// 初始化資料庫
initDatabase();

// 設定定期清理過期快取（每24小時執行一次）
setInterval(() => {
  console.log('正在執行定期快取清理...');
  clearExpiredCache((err, changes) => {
    if (err) {
      console.error('定期清理快取時發生錯誤:', err);
    } else {
      console.log(`定期清理完成，清理了 ${changes} 筆過期的快取記錄`);
    }
  });
}, 24 * 60 * 60 * 1000); // 24小時 = 24 * 60 * 60 * 1000毫秒

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

module.exports = app;
