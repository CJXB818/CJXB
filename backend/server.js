/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash
 *
 * 后端入口：Express 服务
 * - 静态托管 frontend/ 目录
 * - 所有接口以 /api/ 为前缀（RESTful）
 * - 端口固定 8011
 * - 支持所有跨域访问
 */

'use strict';

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const xu_config = require('./xu_env');
const xu_llm = require('./xu_llm');
const xu_comment = require('./xu_comment');
const xu_pool = require('./xu_db');

const xu_app = express();
const xu_frontendDir = path.join(__dirname, '..', 'frontend');

/* ---------------- 中间件 ---------------- */
// 支持所有跨域访问
xu_app.use(cors({ origin: '*' }));

xu_app.use(express.json({ limit: '4mb' }));
xu_app.use(express.urlencoded({ extended: true }));

// 静态托管前端
xu_app.use(express.static(xu_frontendDir));

// 上传配置：内存存储，仅接受 Excel，单文件 5MB
const xu_upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: function (req, file, cb) {
        const xu_ok = /\.(xlsx|xls)$/i.test(file.originalname || '');
        if (!xu_ok) {
            const xu_err = new Error('只支持 .xlsx / .xls 格式的 Excel 文件');
            xu_err.status = 400;
            return cb(xu_err);
        }
        cb(null, true);
    }
});

/* ---------------- 健康检查 ---------------- */
xu_app.get('/api/health', async function (req, res) {
    let xu_dbOk = false;
    try {
        const [xu_rows] = await xu_pool.query('SELECT 1 AS ok');
        xu_dbOk = xu_rows[0].ok === 1;
    } catch (e) {
        xu_dbOk = false;
    }

    res.json({
        code: 0,
        msg: '服务正常',
        data: {
            model: xu_config.xu_model,
            baseUrl: xu_config.xu_baseUrl,
            hasApiKey: Boolean(xu_config.xu_apiKey),
            port: xu_config.xu_port,
            dbConnected: xu_dbOk,
            dbName: xu_config.xu_db.database
        }
    });
});

/* ---------------- 通用聊天接口 ---------------- */
xu_app.post('/api/chat', async function (req, res) {
    const xu_body = req.body || {};
    const xu_messages = xu_body.messages;

    if (!Array.isArray(xu_messages) || xu_messages.length === 0) {
        return res.status(400).json({
            code: 400,
            msg: 'messages 必须是非空数组',
            data: null
        });
    }

    const xu_payloadMessages = xu_messages.map(function (m) {
        return {
            role: String(m.role || 'user'),
            content: String(m.content == null ? '' : m.content)
        };
    });

    try {
        const xu_response = await xu_llm.xu_callLLM(xu_payloadMessages, {
            temperature: typeof xu_body.temperature === 'number' ? xu_body.temperature : 0.7,
            tag: '聊天'
        });

        if (!xu_response.ok) {
            const xu_msg =
                (xu_response.json && xu_response.json.error &&
                    (xu_response.json.error.message || xu_response.json.error.code)) ||
                ('上游服务返回 HTTP ' + xu_response.status);

            return res.status(xu_response.status).json({
                code: xu_response.status,
                msg: String(xu_msg),
                data: xu_response.json || xu_response.text
            });
        }

        const xu_choice =
            (xu_response.json && xu_response.json.choices && xu_response.json.choices[0]) || null;
        const xu_content = (xu_choice && xu_choice.message && xu_choice.message.content) || '';

        return res.json({
            code: 0,
            msg: '请求成功',
            data: {
                content: xu_content,
                model: (xu_response.json && xu_response.json.model) || xu_config.xu_model,
                usage: (xu_response.json && xu_response.json.usage) || null
            }
        });
    } catch (xu_err) {
        console.error('[聊天接口异常]', xu_err);
        return res.status(xu_err.status || 500).json({
            code: xu_err.status || 500,
            msg: xu_err.message,
            data: null
        });
    }
});

/* ---------------- 评论情感分类接口 ---------------- */
xu_app.post('/api/comment/analyze', xu_upload.single('file'), async function (req, res) {
    if (!req.file) {
        return res.status(400).json({
            code: 400,
            msg: '请通过 multipart/form-data 上传文件，字段名为 file',
            data: null
        });
    }

    try {
        const xu_data = await xu_comment.xu_analyzeComments(
            req.file.buffer,
            req.file.originalname
        );

        return res.json({
            code: 0,
            msg: '分析完成，共 ' + xu_data.total + ' 条评论',
            data: xu_data
        });
    } catch (xu_err) {
        console.error('[评论分析失败]', xu_err.message);

        return res.status(xu_err.status || 500).json({
            code: xu_err.status || 500,
            msg: xu_err.message,
            data: {
                parsedTotal: xu_err.parsedTotal || 0,
                detail: xu_err.detail || null
            }
        });
    }
});

/* ---------------- 404 ---------------- */
xu_app.use(function (req, res) {
    res.status(404).json({
        code: 404,
        msg: '接口不存在：' + req.originalUrl,
        data: null
    });
});

/* ---------------- 统一错误处理 ---------------- */
xu_app.use(function (err, req, res, next) {
    console.error('[服务器错误]', err);

    // 文件上传相关错误
    if (err instanceof multer.MulterError) {
        const xu_msg = err.code === 'LIMIT_FILE_SIZE' ? '文件超过 5MB 限制' : ('上传失败：' + err.message);
        return res.status(400).json({ code: 400, msg: xu_msg, data: null });
    }

    res.status(err.status || 500).json({
        code: err.status || 500,
        msg: err.message || '服务器内部错误',
        data: null
    });
});

/* ---------------- 启动 ---------------- */
xu_app.listen(xu_config.xu_port, '0.0.0.0', function () {
    console.log('==================================================');
    console.log('  前端静态目录 : ' + xu_frontendDir);
    console.log('  服务地址     : http://localhost:' + xu_config.xu_port);
    console.log('  聊天接口     : POST /api/chat');
    console.log('  评论分析接口 : POST /api/comment/analyze');
    console.log('  模型         : ' + xu_config.xu_model);
    console.log('  数据库       : ' + xu_config.xu_db.database + ' @ ' + xu_config.xu_db.host);
    console.log('==================================================');
});
