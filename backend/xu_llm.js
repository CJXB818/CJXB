/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash
 *
 * 大模型调用封装：统一打印「发送给大模型」与「从大模型接收」的数据
 * - xu_callLLM  文本 / 视觉（OpenAI 兼容 chat/completions）
 * - xu_callASR  语音识别（/audio/transcriptions，multipart）
 */

'use strict';

const xu_config = require('./xu_env');

/**
 * 日志脱敏：把 base64 图片数据替换为长度说明，避免终端被超长字符串刷屏
 * @param {Object} xu_payload 请求体
 * @returns {Object} 可直接 JSON.stringify 的对象
 */
function xu_sanitizePayload(xu_payload) {
    const xu_copy = JSON.parse(JSON.stringify(xu_payload));

    (xu_copy.messages || []).forEach(function (xu_msg) {
        if (!Array.isArray(xu_msg.content)) return;

        xu_msg.content = xu_msg.content.map(function (xu_part) {
            if (xu_part && xu_part.type === 'image_url' && xu_part.image_url && xu_part.image_url.url) {
                const xu_url = String(xu_part.image_url.url);
                const xu_len = xu_url.length;
                return {
                    type: 'image_url',
                    image_url: { url: xu_url.slice(0, 40) + '...（base64 图片数据 ' + xu_len + ' 字符已省略）' }
                };
            }
            return xu_part;
        });
    });

    return xu_copy;
}

/**
 * 调用 OpenAI 兼容接口
 * @param {Array} xu_messages 消息数组（支持多模态 content 数组）
 * @param {Object} xu_options { temperature, max_tokens, model, tag }
 * @returns {Promise<{ok:boolean,status:number,json:Object|null,text:string}>}
 */
async function xu_callLLM(xu_messages, xu_options) {
    const xu_opt = xu_options || {};
    const xu_tag = xu_opt.tag ? '[' + xu_opt.tag + '] ' : '';
    const xu_model = xu_opt.model || xu_config.xu_model;

    if (!xu_config.xu_apiKey) {
        const xu_err = new Error('服务端未配置 LLM_API_KEY，请检查 backend/.env');
        xu_err.status = 500;
        throw xu_err;
    }

    const xu_payload = {
        model: xu_model,
        messages: xu_messages,
        temperature: typeof xu_opt.temperature === 'number' ? xu_opt.temperature : 0.7,
        stream: false
    };

    if (typeof xu_opt.max_tokens === 'number') {
        xu_payload.max_tokens = xu_opt.max_tokens;
    }

    // 控制台输出：发送给大模型的数据（base64 已脱敏）
    console.log('\n================ ' + xu_tag + '[发送给大模型] ' + new Date().toLocaleString('zh-CN') + ' ================');
    console.log('URL   : ' + xu_config.xu_baseUrl + '/chat/completions');
    console.log('MODEL : ' + xu_model);
    console.log(JSON.stringify(xu_sanitizePayload(xu_payload), null, 2));

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

/**
 * 调用语音识别接口（multipart/form-data）
 * @param {Buffer} xu_buffer 音频二进制
 * @param {string} xu_mime 音频 MIME
 * @param {string} xu_fileName 文件名
 * @param {Object} xu_options { model, tag }
 * @returns {Promise<{ok:boolean,status:number,json:Object|null,text:string}>}
 */
async function xu_callASR(xu_buffer, xu_mime, xu_fileName, xu_options) {
    const xu_opt = xu_options || {};
    const xu_tag = xu_opt.tag ? '[' + xu_opt.tag + '] ' : '';
    const xu_model = xu_opt.model || xu_config.xu_asrModel;

    if (!xu_config.xu_apiKey) {
        const xu_err = new Error('服务端未配置 LLM_API_KEY，请检查 backend/.env');
        xu_err.status = 500;
        throw xu_err;
    }

    const xu_form = new FormData();
    xu_form.append('file', new Blob([xu_buffer], { type: xu_mime || 'audio/wav' }), xu_fileName || 'audio.wav');
    xu_form.append('model', xu_model);

    // 控制台输出：发送给语音模型的数据（二进制不打印，只打印元信息）
    console.log('\n================ ' + xu_tag + '[发送给语音模型] ' + new Date().toLocaleString('zh-CN') + ' ================');
    console.log('URL   : ' + xu_config.xu_baseUrl + '/audio/transcriptions');
    console.log('MODEL : ' + xu_model);
    console.log(JSON.stringify({
        file: xu_fileName,
        mime: xu_mime,
        size: xu_buffer.length + ' 字节'
    }, null, 2));

    let xu_resp;
    try {
        xu_resp = await fetch(xu_config.xu_baseUrl + '/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + xu_config.xu_apiKey },
            body: xu_form
        });
    } catch (xu_netErr) {
        console.error('================ ' + xu_tag + '[请求语音模型失败] ================');
        console.error(xu_netErr);
        const xu_err = new Error('请求语音模型失败：' + xu_netErr.message);
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

    console.log('================ ' + xu_tag + '[从语音模型接收] HTTP ' + xu_resp.status + ' ================');
    console.log(xu_json ? JSON.stringify(xu_json, null, 2) : xu_text);

    return {
        ok: xu_resp.ok,
        status: xu_resp.status,
        json: xu_json,
        text: xu_text
    };
}

module.exports = {
    xu_callLLM: xu_callLLM,
    xu_callASR: xu_callASR,
    xu_sanitizePayload: xu_sanitizePayload
};
