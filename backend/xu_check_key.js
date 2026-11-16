/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash
 *
 * 大模型凭据自检脚本
 * 用法：node xu_check_key.js
 */

'use strict';

const xu_config = require('./xu_env');

(async function () {
    const xu_key = xu_config.xu_apiKey;

    console.log('==================================================');
    console.log('BaseURL : ' + xu_config.xu_baseUrl);
    console.log('Model   : ' + xu_config.xu_model);
    console.log('API Key : ' + (xu_key ? (xu_key.slice(0, 8) + '...' + xu_key.slice(-4) + '  (长度 ' + xu_key.length + ')') : '未配置'));
    console.log('==================================================');

    if (!xu_key) {
        console.log('[结果] backend/.env 中没有 LLM_API_KEY');
        process.exit(1);
    }

    try {
        const xu_resp = await fetch(xu_config.xu_baseUrl + '/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + xu_key
            },
            body: JSON.stringify({
                model: xu_config.xu_model,
                messages: [{ role: 'user', content: '回复 OK 两个字母即可' }],
                max_tokens: 8,
                stream: false
            })
        });

        const xu_text = await xu_resp.text();
        console.log('HTTP ' + xu_resp.status);
        console.log(xu_text.slice(0, 800));

        if (xu_resp.ok) {
            console.log('\n[结果] 密钥可用，聊天接口调用成功。');
            process.exit(0);
        }

        console.log('\n[结果] 密钥不可用，或模型无权限。请到平台控制台重新生成 API Key。');
        process.exit(2);
    } catch (xu_err) {
        console.log('\n[结果] 网络错误：' + xu_err.message);
        process.exit(3);
    }
})();
