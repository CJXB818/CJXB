/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash
 *
 * 环境变量加载：读取 backend/.env 到 process.env
 */

'use strict';

const fs = require('fs');
const path = require('path');

function xu_loadEnv(filePath) {
    if (!fs.existsSync(filePath)) return;

    fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach(function (line) {
        const xu_line = line.trim();
        if (!xu_line || xu_line.startsWith('#')) return;

        const xu_index = xu_line.indexOf('=');
        if (xu_index === -1) return;

        const xu_key = xu_line.slice(0, xu_index).trim();
        let xu_value = xu_line.slice(xu_index + 1).trim();

        if (
            (xu_value.startsWith('"') && xu_value.endsWith('"')) ||
            (xu_value.startsWith("'") && xu_value.endsWith("'"))
        ) {
            xu_value = xu_value.slice(1, -1);
        }

        if (!process.env[xu_key]) process.env[xu_key] = xu_value;
    });
}

xu_loadEnv(path.join(__dirname, '.env'));

module.exports = {
    xu_port: Number(process.env.PORT) || 8011,
    xu_baseUrl: process.env.LLM_BASE_URL || 'https://api.qnaigc.com/v1',
    xu_model: process.env.LLM_MODEL || 'deepseek-ai/DeepSeek-V4.1-Flash',
    xu_visionModel: process.env.LLM_VISION_MODEL || 'Qwen/Qwen3-VL-32B-Instruct',
    xu_asrModel: process.env.LLM_ASR_MODEL || 'FunAudioLLM/SenseVoiceSmall',
    xu_apiKey: process.env.LLM_API_KEY || '',
    xu_db: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'xu_sentiment'
    }
};
