/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash
 *
 * 大模型调用封装：统一打印「发送给大模型」与「从大模型接收」的数据
 */

'use strict';

const xu_config = require('./xu_env');

/**
 * 调用 OpenAI 兼容接口
 * @param {Array} xu_messages 消息数组
 * @param {Object} xu_options { temperature, max_tokens }
 * @returns {Promise<{ok:boolean,status:number,json:Object|null,text:string}>}
 */
async function xu_callLLM(xu_messages, xu_options) {
    const xu_opt = xu_options || {};
    const xu_tag = xu_opt.tag ? '[' + xu_opt.tag + '] ' : '';

    if (!xu_config.xu_apiKey) {
        const xu_err = new Error('服务端未配置 LLM_API_KEY，请检查 backend/.env');
        xu_err.status = 500;
        throw xu_err;
    }

    const xu_payload = {
        model: xu_config.xu_model,
        messages: xu_messages,
        temperature: typeof xu_opt.temperature === 'number' ? xu_opt.temperature : 0.7,
        stream: false
    };

    if (typeof xu_opt.max_tokens === 'number') {
        xu_payload.max_tokens = xu_opt.max_tokens;
    }

    // 控制台输出：发送给大模型的数据
    console.log('\n================ ' + xu_tag + '[发送给大模型] ' + new Date().toLocaleString('zh-CN') + ' ================');
    console.log('URL   : ' + xu_config.xu_baseUrl + '/chat/completions');
    console.log('MODEL : ' + xu_config.xu_model);
    console.log(JSON.stringify(xu_payload, null, 2));

    let xu_resp;
    try {
        xu_resp = await fetch(xu_config.xu_baseUrl + '/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + xu_config.xu_apiKey
            },
            body: JSON.stringify(xu_payload)
        });
    } catch (xu_netErr) {
        console.error('================ ' + xu_tag + '[请求大模型失败] ================');
        console.error(xu_netErr);
        const xu_err = new Error('请求大模型失败：' + xu_netErr.message);
        xu_err.status = 502;
        throw xu_err;
    }

    const xu_text = await xu_resp.text();
    let xu_json = null;
    try {
        xu_json = JSON.parse(xu_text);
    } catch (e) {
        xu_json = null;
    }

    // 控制台输出：从大模型接收到的数据
    console.log('================ ' + xu_tag + '[从大模型接收] HTTP ' + xu_resp.status + ' ================');
    console.log(xu_json ? JSON.stringify(xu_json, null, 2) : xu_text);

    return {
        ok: xu_resp.ok,
        status: xu_resp.status,
        json: xu_json,
        text: xu_text
    };
}

module.exports = { xu_callLLM: xu_callLLM };
