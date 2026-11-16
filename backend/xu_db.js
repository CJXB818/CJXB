/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash
 *
 * MySQL 连接池（凭据来自 backend/.env）
 */

'use strict';

const mysql = require('mysql2/promise');
const xu_config = require('./xu_env');

const xu_pool = mysql.createPool({
    host: xu_config.xu_db.host,
    user: xu_config.xu_db.user,
    password: xu_config.xu_db.password,
    database: xu_config.xu_db.database,
    waitForConnections: true,
    connectionLimit: 8,
    queueLimit: 0,
    charset: 'utf8mb4'
});

module.exports = xu_pool;
