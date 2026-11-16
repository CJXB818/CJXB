/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash / Qwen3-VL-32B-Instruct / SenseVoiceSmall
 *
 * 多模态识别业务层
 * - 图像识别：Qwen/Qwen3-VL-32B-Instruct 读取图片（主体、场景、图中文字、评价文本）
 * - 语音识别：FunAudioLLM/SenseVoiceSmall 把语音评论转写为文字
 * - 识别得到的文本统一交给 xu_comment.xu_classifyList 做情感分类
 */

'use strict';

const xu_pool = require('./xu_db');
const xu_llm = require('./xu_llm');
const xu_config = require('./xu_env');
const xu_comment = require('./xu_comment');

const XU_MAX_OCR_COMMENTS = 20;   // 单张图片最多分析的评论条数

/* ---------------- 通用工具 ---------------- */

function xu_extractJSON(xu_text) {
    let xu_t = String(xu_text || '').trim();
    xu_t = xu_t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    const xu_i = xu_t.indexOf('{');
    const xu_j = xu_t.lastIndexOf('}');
    if (xu_i === -1 || xu_j === -1 || xu_j <= xu_i) {
        throw new Error('模型返回内容中未找到 JSON 对象');
    }

    return JSON.parse(xu_t.slice(xu_i, xu_j + 1));
}

function xu_str(xu_v, xu_max) {
    const xu_s = xu_v == null ? '' : String(xu_v).trim();
    return xu_max ? xu_s.slice(0, xu_max) : xu_s;
}

function xu_strList(xu_v, xu_max) {
    if (!Array.isArray(xu_v)) return [];
    return xu_v
        .map(function (xu_item) {
            if (typeof xu_item === 'string') return xu_item.trim();
            if (xu_item && typeof xu_item === 'object') {
                return String(xu_item.text || xu_item.content || xu_item.name || '').trim();
            }
            return '';
        })
        .filter(function (xu_s) { return Boolean(xu_s); })
        .slice(0, xu_max);
}

/**
 * 统计分类结果：好评/中评/差评数量、平均置信度、待复核数量
 */
function xu_buildStats(xu_list) {
    const xu_summary = { '好评': 0, '中评': 0, '差评': 0 };
    let xu_confSum = 0;
    let xu_needReview = 0;

    (xu_list || []).forEach(function (xu_r) {
        if (xu_r.sentiment && xu_summary[xu_r.sentiment] !== undefined) {
            xu_summary[xu_r.sentiment] += 1;
        }
        xu_confSum += xu_r.confidence || 0;
        if (xu_r.need_review) xu_needReview += 1;
    });

    return {
        summary: xu_summary,
        avgConfidence: xu_list && xu_list.length
            ? Math.round(xu_confSum / xu_list.length * 100) / 100
            : 0,
        needReview: xu_needReview
    };
}

/**
 * 写入多模态识别记录（失败不影响主流程）
 */
async function xu_saveRecord(xu_data) {
    try {
        const [xu_res] = await xu_pool.query(
            'INSERT INTO xu_multimodal (xu_modality, xu_file_name, xu_mime, xu_size, xu_text, xu_meta, ' +
            'xu_sentiment, xu_confidence, xu_need_review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                xu_data.modality,
                xu_data.fileName,
                xu_data.mime,
                xu_data.size,
                xu_data.text || '',
                JSON.stringify(xu_data.meta || {}),
                xu_data.sentiment || null,
                xu_data.confidence == null ? null : xu_data.confidence,
                xu_data.needReview ? 1 : 0
            ]
        );
        return xu_res.insertId;
    } catch (xu_err) {
        console.error('[多模态记录入库失败]', xu_err.message);
        return null;
    }
}

/* ---------------- 图像识别 ---------------- */

function xu_buildVisionPrompt() {
    return [
        '请阅读这张图片，并严格按以下 JSON 结构输出，不要输出任何解释、注释或 markdown 代码块标记：',
        '{',
        '  "subject": "图片主体（不超过 20 字）",',
        '  "scene": "场景描述（不超过 40 字）",',
        '  "ocr_text": "图中出现的全部文字，按原样保留，多行用 \\\\n 分隔",',
        '  "comments": ["图中可识别的用户评价原文，逐条列出；没有则为空数组"],',
        '  "tags": ["关键词标签，3-6 个"],',
        '  "clarity": "clear 或 blurry"',
        '}',
        '',
        '要求：',
        '1. comments 必须是图片中真实出现的评价文字，不得自行编写或改写；',
        '2. 若图中没有评价类文字，comments 返回空数组；',
        '3. 只输出 JSON 对象本身。'
    ].join('\n');
}

async function xu_analyzeImage(xu_buffer, xu_mime, xu_fileName) {
    const xu_name = xu_comment.xu_fixFileName(xu_fileName || '未命名图片');
    const xu_b64 = xu_buffer.toString('base64');
    const xu_dataUrl = 'data:' + (xu_mime || 'image/png') + ';base64,' + xu_b64;

    const xu_response = await xu_llm.xu_callLLM([
        {
            role: 'system',
            content: '你是图片内容分析专家，擅长识别画面主体、场景，并准确提取图片中的中文文字。'
        },
        {
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: xu_dataUrl } },
                { type: 'text', text: xu_buildVisionPrompt() }
            ]
        }
    ], {
        model: xu_config.xu_visionModel,
        temperature: 0.1,
        max_tokens: 1200,
        tag: '图像识别'
    });

    if (!xu_response.ok) {
        const xu_msg =
            (xu_response.json && xu_response.json.error &&
                (xu_response.json.error.message || xu_response.json.error.code)) ||
            ('上游返回 HTTP ' + xu_response.status);
        const xu_err = new Error('图像识别失败：' + xu_msg);
        xu_err.status = xu_response.status >= 400 ? xu_response.status : 502;
        xu_err.detail = xu_response.json || xu_response.text;
        throw xu_err;
    }

    const xu_content =
        (xu_response.json && xu_response.json.choices && xu_response.json.choices[0] &&
            xu_response.json.choices[0].message && xu_response.json.choices[0].message.content) || '';

    let xu_parsed = null;
    try {
        xu_parsed = xu_extractJSON(xu_content);
    } catch (xu_e) {
        const xu_err = new Error('图像识别结果不是合法 JSON：' + xu_e.message);
        xu_err.status = 502;
        xu_err.detail = xu_content;
        throw xu_err;
    }

    const xu_ocrText = xu_str(xu_parsed.ocr_text, 4000);
    let xu_comments = xu_strList(xu_parsed.comments, XU_MAX_OCR_COMMENTS);

    // 兜底：模型没单独给出 comments 时，用整段文字作为一条评论
    if (!xu_comments.length && xu_ocrText) {
        xu_comments = [xu_ocrText];
    }

    let xu_classified = [];
    let xu_stats = { summary: { '好评': 0, '中评': 0, '差评': 0 }, avgConfidence: 0, needReview: 0 };
    let xu_usage = null;

    if (xu_comments.length) {
        const xu_cls = await xu_comment.xu_classifyList(
            xu_comments.map(function (xu_t, xu_i) {
                return { no: xu_i + 1, content: xu_t };
            }),
            '图像评论分类'
        );
        xu_classified = xu_cls.list;
        xu_stats = xu_buildStats(xu_classified);
        xu_usage = (xu_cls.response && xu_cls.response.json && xu_cls.response.json.usage) || null;
    }

    const xu_meta = {
        subject: xu_str(xu_parsed.subject, 60),
        scene: xu_str(xu_parsed.scene, 120),
        ocrText: xu_ocrText,
        tags: xu_strList(xu_parsed.tags, 8),
        clarity: xu_str(xu_parsed.clarity, 20) || 'clear',
        visionModel: xu_config.xu_visionModel,
        classifyModel: xu_config.xu_model
    };

    const xu_main = xu_classified[0] || null;

    const xu_recordId = await xu_saveRecord({
        modality: 'image',
        fileName: xu_name,
        mime: xu_mime,
        size: xu_buffer.length,
        text: xu_ocrText || xu_comments.join(' / '),
        meta: xu_meta,
        sentiment: xu_main ? xu_main.sentiment : null,
        confidence: xu_main ? xu_main.confidence : null,
        needReview: xu_stats.needReview > 0
    });

    return {
        recordId: xu_recordId,
        modality: 'image',
        fileName: xu_name,
        size: xu_buffer.length,
        visionModel: xu_config.xu_visionModel,
        subject: xu_meta.subject,
        scene: xu_meta.scene,
        ocrText: xu_ocrText,
        tags: xu_meta.tags,
        clarity: xu_meta.clarity,
        comments: xu_classified,
        total: xu_classified.length,
        summary: xu_stats.summary,
        avgConfidence: xu_stats.avgConfidence,
        needReview: xu_stats.needReview,
        usage: xu_usage
    };
}

/* ---------------- 语音识别 ---------------- */

async function xu_analyzeAudio(xu_buffer, xu_mime, xu_fileName) {
    const xu_name = xu_comment.xu_fixFileName(xu_fileName || '未命名音频');
    const xu_response = await xu_llm.xu_callASR(xu_buffer, xu_mime, xu_name, {
        model: xu_config.xu_asrModel,
        tag: '语音识别'
    });

    if (!xu_response.ok) {
        const xu_msg =
            (xu_response.json && xu_response.json.error &&
                (xu_response.json.error.message || xu_response.json.error.code)) ||
            ('上游返回 HTTP ' + xu_response.status);
        const xu_err = new Error('语音识别失败：' + xu_msg);
        xu_err.status = xu_response.status >= 400 ? xu_response.status : 502;
        xu_err.detail = xu_response.json || xu_response.text;
        throw xu_err;
    }

    const xu_text = xu_str((xu_response.json && xu_response.json.text) || '', 4000);
    if (!xu_text) {
        const xu_err = new Error('语音识别结果为空，请确认音频中包含清晰的中文语音');
        xu_err.status = 422;
        throw xu_err;
    }

    const xu_cls = await xu_comment.xu_classifyList(
        [{ no: 1, content: xu_text }],
        '语音评论分类'
    );
    const xu_classified = xu_cls.list;
    const xu_stats = xu_buildStats(xu_classified);

    const xu_meta = {
        language: xu_str((xu_response.json && xu_response.json.language) || '', 30),
        duration: (xu_response.json && xu_response.json.usage && xu_response.json.usage.seconds) || null,
        asrModel: xu_config.xu_asrModel,
        classifyModel: xu_config.xu_model
    };

    const xu_main = xu_classified[0] || null;

    const xu_recordId = await xu_saveRecord({
        modality: 'audio',
        fileName: xu_name,
        mime: xu_mime,
        size: xu_buffer.length,
        text: xu_text,
        meta: xu_meta,
        sentiment: xu_main ? xu_main.sentiment : null,
        confidence: xu_main ? xu_main.confidence : null,
        needReview: xu_stats.needReview > 0
    });

    return {
        recordId: xu_recordId,
        modality: 'audio',
        fileName: xu_name,
        size: xu_buffer.length,
        asrModel: xu_config.xu_asrModel,
        text: xu_text,
        language: xu_meta.language,
        duration: xu_meta.duration,
        comments: xu_classified,
        total: xu_classified.length,
        summary: xu_stats.summary,
        avgConfidence: xu_stats.avgConfidence,
        needReview: xu_stats.needReview
    };
}

module.exports = {
    xu_analyzeImage: xu_analyzeImage,
    xu_analyzeAudio: xu_analyzeAudio
};
