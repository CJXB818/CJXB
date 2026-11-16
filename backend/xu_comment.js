/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash
 *
 * 商业评论情感分类业务：
 * 解析 Excel → 构造提示词 → 调用大模型 → 解析结果 → 写入 MySQL → 返回统计与精选
 */

'use strict';

const XLSX = require('xlsx');
const xu_pool = require('./xu_db');
const xu_llm = require('./xu_llm');

const XU_MAX_COMMENTS = 60;   // 单次最多分析条数，避免提示词过长
const XU_MAX_FEATURED = 6;    // 精选评论上限

/* ---------------- 文件名编码修正（multipart 中文名） ---------------- */
function xu_fixFileName(xu_name) {
    try {
        const xu_fixed = Buffer.from(xu_name, 'latin1').toString('utf8');
        return xu_fixed.indexOf('\uFFFD') === -1 ? xu_fixed : xu_name;
    } catch (e) {
        return xu_name;
    }
}

/* ---------------- Excel 解析 ---------------- */
function xu_pickContentKey(xu_row) {
    const xu_keys = Object.keys(xu_row);

    let xu_key = xu_keys.find(function (k) { return /评论/.test(k); });
    if (!xu_key) xu_key = xu_keys.find(function (k) { return /content|comment/i.test(k); });
    if (!xu_key) xu_key = xu_keys.find(function (k) { return /内容/.test(k); });
    if (!xu_key) {
        xu_key = xu_keys.find(function (k) {
            return typeof xu_row[k] === 'string' && xu_row[k].trim().length >= 4;
        });
    }
    return xu_key || null;
}

function xu_parseExcel(xu_buffer) {
    const xu_book = XLSX.read(xu_buffer, { type: 'buffer' });
    if (!xu_book.SheetNames.length) {
        const xu_err = new Error('Excel 中没有工作表');
        xu_err.status = 400;
        throw xu_err;
    }

    const xu_sheet = xu_book.Sheets[xu_book.SheetNames[0]];
    const xu_rows = XLSX.utils.sheet_to_json(xu_sheet, { defval: '' });

    const xu_list = [];
    xu_rows.forEach(function (xu_row) {
        const xu_key = xu_pickContentKey(xu_row);
        if (!xu_key) return;

        const xu_content = String(xu_row[xu_key] || '').trim();
        if (xu_content.length < 2) return;

        xu_list.push({
            no: xu_list.length + 1,
            content: xu_content.slice(0, 500)
        });
    });

    return xu_list;
}

/* ---------------- 提示词 ---------------- */
function xu_buildPrompt(xu_comments) {
    const xu_lines = xu_comments.map(function (xu_c) {
        return xu_c.no + '. ' + xu_c.content;
    }).join('\n');

    return [
        '请对以下 ' + xu_comments.length + ' 条商业评论逐条进行情感分类。',
        '',
        '分类标准：',
        '- 好评：整体表达满意、认可或推荐',
        '- 中评：褒贬并存、态度中性，或仅提出轻微改进建议',
        '- 差评：明显不满、投诉质量问题或服务失败',
        '',
        '输出要求：为每条评论生成一个对象，字段如下',
        '- no：评论序号，必须与输入编号一致',
        '- sentiment：只能是「好评」「中评」「差评」之一',
        '- score：情感倾向得分，-1 到 1 之间，保留两位小数',
        '- reason：不超过 25 字的中文理由',
        '- featured：是否作为精选评论展示，需有具体细节且表达完整，最多 ' + XU_MAX_FEATURED + ' 条为 true',
        '',
        '只输出 JSON，不要输出任何解释或代码块标记，格式：',
        '{"results":[{"no":1,"sentiment":"好评","score":0.86,"reason":"明确肯定口感与包装","featured":true}]}',
        '',
        '评论列表：',
        xu_lines
    ].join('\n');
}

/* ---------------- 模型返回结果解析 ---------------- */
function xu_extractJSON(xu_text) {
    let xu_t = String(xu_text || '').trim();

    xu_t = xu_t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    const xu_start = xu_t.indexOf('{');
    const xu_end = xu_t.lastIndexOf('}');
    if (xu_start !== -1 && xu_end > xu_start) {
        xu_t = xu_t.slice(xu_start, xu_end + 1);
    }

    return JSON.parse(xu_t);
}

function xu_normalizeResults(xu_comments, xu_modelResults) {
    const xu_map = new Map();

    (xu_modelResults || []).forEach(function (xu_item) {
        if (!xu_item) return;
        const xu_no = Number(xu_item.no);
        if (!Number.isFinite(xu_no)) return;

        let xu_sentiment = String(xu_item.sentiment || '').trim();
        if (['好评', '中评', '差评'].indexOf(xu_sentiment) === -1) {
            if (/好|正|满意/.test(xu_sentiment)) xu_sentiment = '好评';
            else if (/差|负|不满/.test(xu_sentiment)) xu_sentiment = '差评';
            else xu_sentiment = '中评';
        }

        let xu_score = Number(xu_item.score);
        if (!Number.isFinite(xu_score)) xu_score = 0;
        xu_score = Math.max(-1, Math.min(1, xu_score));

        xu_map.set(xu_no, {
            sentiment: xu_sentiment,
            score: xu_score,
            reason: String(xu_item.reason || '').slice(0, 255),
            featured: xu_item.featured === true || xu_item.featured === 1 || xu_item.featured === 'true'
        });
    });

    const xu_result = xu_comments.map(function (xu_c) {
        const xu_hit = xu_map.get(xu_c.no);
        return {
            no: xu_c.no,
            content: xu_c.content,
            sentiment: xu_hit ? xu_hit.sentiment : null,
            score: xu_hit ? xu_hit.score : null,
            reason: xu_hit ? xu_hit.reason : '模型未返回该条结果',
            featured: xu_hit ? xu_hit.featured : false
        };
    });

    // 精选数量超限时按得分绝对值排序截断
    const xu_featuredList = xu_result.filter(function (xu_x) { return xu_x.featured; });
    if (xu_featuredList.length > XU_MAX_FEATURED) {
        xu_featuredList
            .slice()
            .sort(function (a, b) { return Math.abs(a.score || 0) - Math.abs(b.score || 0); })
            .slice(0, xu_featuredList.length - XU_MAX_FEATURED)
            .forEach(function (xu_x) { xu_x.featured = false; });
    }

    return xu_result;
}

/* ---------------- 入库 ---------------- */
async function xu_saveToDB(xu_fileName, xu_comments, xu_source) {
    const xu_conn = await xu_pool.getConnection();

    try {
        await xu_conn.beginTransaction();

        const [xu_fileResult] = await xu_conn.query(
            'INSERT INTO xu_comment_file (xu_file_name, xu_total, xu_source) VALUES (?, ?, ?)',
            [xu_fileName, xu_comments.length, xu_source || 'upload']
        );
        const xu_fileId = xu_fileResult.insertId;

        const xu_values = xu_comments.map(function (xu_c) {
            return [
                xu_fileId,
                xu_c.no,
                xu_c.content,
                xu_c.sentiment,
                xu_c.score,
                xu_c.reason,
                xu_c.featured ? 1 : 0
            ];
        });

        await xu_conn.query(
            'INSERT INTO xu_comment (xu_file_id, xu_no, xu_content, xu_sentiment, xu_score, xu_reason, xu_featured) VALUES ?',
            [xu_values]
        );

        await xu_conn.commit();
        return xu_fileId;
    } catch (xu_err) {
        await xu_conn.rollback();
        throw xu_err;
    } finally {
        xu_conn.release();
    }
}

/* ---------------- 主流程 ---------------- */
async function xu_analyzeComments(xu_buffer, xu_originalName) {
    const xu_fileName = xu_fixFileName(xu_originalName || '未命名.xlsx');

    let xu_comments = xu_parseExcel(xu_buffer);

    if (!xu_comments.length) {
        const xu_err = new Error('未在文件中解析到评论内容，请确认存在「评论内容」列且内容非空');
        xu_err.status = 400;
        throw xu_err;
    }

    const xu_truncated = xu_comments.length > XU_MAX_COMMENTS;
    if (xu_truncated) {
        xu_comments = xu_comments.slice(0, XU_MAX_COMMENTS);
    }

    const xu_prompt = xu_buildPrompt(xu_comments);

    const xu_response = await xu_llm.xu_callLLM([
        {
            role: 'system',
            content: '你是电商评论情感分析专家，严格按要求只输出 JSON，不要输出解释或代码块标记。'
        },
        { role: 'user', content: xu_prompt }
    ], { temperature: 0.2, tag: '评论情感分类' });

    if (!xu_response.ok) {
        const xu_msg =
            (xu_response.json && xu_response.json.error &&
                (xu_response.json.error.message || xu_response.json.error.code)) ||
            ('上游返回 HTTP ' + xu_response.status);

        const xu_err = new Error('大模型调用失败：' + xu_msg);
        xu_err.status = xu_response.status >= 400 ? xu_response.status : 502;
        xu_err.detail = xu_response.json || xu_response.text;
        xu_err.parsedTotal = xu_comments.length;
        throw xu_err;
    }

    const xu_content =
        (xu_response.json && xu_response.json.choices &&
            xu_response.json.choices[0] && xu_response.json.choices[0].message &&
            xu_response.json.choices[0].message.content) || '';

    let xu_data;
    try {
        xu_data = xu_extractJSON(xu_content);
    } catch (xu_parseErr) {
        const xu_err = new Error('大模型返回内容不是合法 JSON，无法解析');
        xu_err.status = 502;
        xu_err.detail = xu_content.slice(0, 500);
        throw xu_err;
    }

    const xu_results = xu_normalizeResults(xu_comments, xu_data.results);

    const xu_summary = { '好评': 0, '中评': 0, '差评': 0 };
    xu_results.forEach(function (xu_r) {
        if (xu_r.sentiment && xu_summary[xu_r.sentiment] !== undefined) {
            xu_summary[xu_r.sentiment] += 1;
        }
    });

    const xu_featured = xu_results.filter(function (xu_r) { return xu_r.featured; });

    let xu_fileId = null;
    try {
        xu_fileId = await xu_saveToDB(xu_fileName, xu_results, 'upload');
    } catch (xu_dbErr) {
        console.error('[写入数据库失败]', xu_dbErr.message);
    }

    return {
        fileId: xu_fileId,
        fileName: xu_fileName,
        total: xu_results.length,
        truncated: xu_truncated,
        summary: xu_summary,
        model: (xu_response.json && xu_response.json.model) || '',
        usage: (xu_response.json && xu_response.json.usage) || null,
        comments: xu_results,
        featured: xu_featured
    };
}

module.exports = {
    xu_analyzeComments: xu_analyzeComments,
    xu_parseExcel: xu_parseExcel,
    xu_fixFileName: xu_fixFileName
};
