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
const XU_MAX_RETRY = 1;       // 结构化输出校验失败后的重试次数
const XU_VALID_RATIO = 0.8;   // 字段校验通过率低于该值时触发重试

// 模型情感枚举（英文）与中文展示值互转
const XU_SENTIMENT_TO_CN = { positive: '好评', neutral: '中评', negative: '差评' };
const XU_SENTIMENT_CN = ['好评', '中评', '差评'];
// 中文情感对应的倾向方向，用于由置信度换算 -1 ~ 1 的得分
const XU_SENTIMENT_DIRECTION = { '好评': 1, '中评': 0, '差评': -1 };

// 实体类型白名单，越界则回落为 other
const XU_ENTITY_TYPES = ['brand', 'product', 'service', 'logistics', 'person', 'other'];

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
/**
 * 构造评论情感分类提示词
 * 结构固定为：角色 → 任务 → 字段约定（JSON Schema 描述）→ 分类标准 → 少样本示例 → 输入数据
 * @param {Array} xu_comments 评论列表
 * @param {Boolean} xu_repair 是否为重试（追加纠正指令）
 */
function xu_buildPrompt(xu_comments, xu_repair) {
    const xu_lines = xu_comments.map(function (xu_c) {
        return xu_c.no + '. ' + xu_c.content;
    }).join('\n');

    const xu_parts = [
        '【任务】对下面 ' + xu_comments.length + ' 条商业评论逐条进行情感分类，把自然语言转换为约定的结构化 JSON。',
        '',
        '【字段约定】results 为数组，每个元素对象必须包含以下字段，类型不得改变：',
        '- no：integer，评论序号，必须与输入编号一一对应，不得缺失、不得重复',
        '- sentiment：string，枚举值，只能取 positive / neutral / negative 之一',
        '- confidence：number，0~1 之间的两位小数，表示分类置信度',
        '- aspects：string[]，1~3 个评论涉及维度，取值优先从 物流、包装、口味、客服、价格、质量、售后、功能、外观 中选择',
        '- entities：object[]，评论中出现的实体，元素形如 {"name":"实体名","type":"brand|product|service|logistics|person|other"}，没有实体时输出 []',
        '- summary：string，不超过 30 字的中文一句话摘要',
        '- need_review：boolean，当 confidence < 0.6、反讽、语义矛盾或信息不足时为 true，否则为 false',
        '- featured：boolean，是否为精选评论，要求有具体细节且表达完整，最多 ' + XU_MAX_FEATURED + ' 条为 true',
        '',
        '【分类标准】',
        '- positive（好评）：整体表达满意、认可或推荐',
        '- neutral（中评）：褒贬并存、态度中性，或仅提出轻微改进建议',
        '- negative（差评）：明显不满、投诉质量问题或服务失败',
        '',
        '【输出格式】只输出一个 JSON 对象，不要输出解释、不要使用 markdown 代码块标记、不要输出多余文字：',
        '{"results":[{"no":1,"sentiment":"positive","confidence":0.93,"aspects":["包装","口味"],"entities":[{"name":"车厘子","type":"product"}],"summary":"包装保鲜到位，口感满意","need_review":false,"featured":true}]}',
        '',
        '【少样本示例】',
        '输入：1. 包装很用心，冰袋还没化，车厘子又大又甜，下次还来买',
        '输出：{"results":[{"no":1,"sentiment":"positive","confidence":0.93,"aspects":["包装","口味"],"entities":[{"name":"车厘子","type":"product"},{"name":"冰袋","type":"logistics"}],"summary":"包装保鲜到位，口感满意，复购意愿强","need_review":false,"featured":true}]}',
        '输入：2. 东西还行，就是配送比承诺晚了一天',
        '输出：{"results":[{"no":2,"sentiment":"neutral","confidence":0.72,"aspects":["物流"],"entities":[{"name":"配送","type":"logistics"}],"summary":"商品可接受，配送时效不符预期","need_review":false,"featured":false}]}',
        ''
    ];

    if (xu_repair) {
        xu_parts.push('【重要纠正】上一次输出无法通过 JSON 校验，本次务必只输出合法 JSON，字段名与类型严格按照字段约定，sentiment 只能用英文枚举值。');
        xu_parts.push('');
    }

    xu_parts.push('【评论列表】');
    xu_parts.push(xu_lines);

    return xu_parts.join('\n');
}

/* ---------------- 模型返回结果解析与字段校验 ---------------- */
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

function xu_toBool(xu_v) {
    if (xu_v === true || xu_v === 1) return true;
    if (typeof xu_v === 'string') {
        return ['true', '1', '是', 'yes'].indexOf(xu_v.trim().toLowerCase()) !== -1;
    }
    return false;
}

function xu_toNumber(xu_v) {
    if (xu_v === null || xu_v === undefined || xu_v === '') return null;
    const xu_n = typeof xu_v === 'number' ? xu_v : parseFloat(String(xu_v).replace(/[^\d.\-]/g, ''));
    return Number.isFinite(xu_n) ? xu_n : null;
}

// 情感枚举归一：合法值返回 valid=true，非法值按关键词兜底并标记 invalid
function xu_normalizeSentiment(xu_raw) {
    const xu_text = String(xu_raw == null ? '' : xu_raw).trim();
    const xu_low = xu_text.toLowerCase();

    if (XU_SENTIMENT_TO_CN[xu_low]) {
        return { cn: XU_SENTIMENT_TO_CN[xu_low], valid: true };
    }
    if (XU_SENTIMENT_CN.indexOf(xu_text) !== -1) {
        return { cn: xu_text, valid: true };
    }
    if (/pos|好|正|满意|推荐/.test(xu_low)) return { cn: '好评', valid: false };
    if (/neg|差|负|不满|投诉/.test(xu_low)) return { cn: '差评', valid: false };
    if (xu_text) return { cn: '中评', valid: false };
    return { cn: null, valid: false };
}

function xu_normalizeAspects(xu_raw) {
    let xu_arr = [];
    if (Array.isArray(xu_raw)) {
        xu_arr = xu_raw.slice();
    } else if (typeof xu_raw === 'string') {
        xu_arr = xu_raw.split(/[、,，;；\s]+/);
    }

    xu_arr = xu_arr
        .map(function (xu_v) { return String(xu_v == null ? '' : xu_v).trim(); })
        .filter(function (xu_v) { return xu_v && xu_v.length <= 12; });

    return xu_arr.slice(0, 3);
}

function xu_normalizeEntities(xu_raw) {
    if (!Array.isArray(xu_raw)) return [];

    const xu_out = [];
    xu_raw.forEach(function (xu_e) {
        if (!xu_e) return;

        let xu_name = '';
        let xu_type = 'other';

        if (typeof xu_e === 'string') {
            xu_name = xu_e.trim();
        } else if (typeof xu_e === 'object') {
            xu_name = String(xu_e.name || xu_e.entity || '').trim();
            xu_type = String(xu_e.type || 'other').trim().toLowerCase();
        }

        if (!xu_name) return;
        if (XU_ENTITY_TYPES.indexOf(xu_type) === -1) xu_type = 'other';

        xu_out.push({ name: xu_name.slice(0, 40), type: xu_type });
    });

    return xu_out.slice(0, 4);
}

/**
 * 单条结果校验：字段缺失、类型不符一律记录错误，并强制标记人工复核
 */
function xu_validateItem(xu_item) {
    const xu_errors = [];
    const xu_sent = xu_normalizeSentiment(xu_item.sentiment);
    if (!xu_sent.valid) xu_errors.push('sentiment 非合法枚举');

    let xu_conf = xu_toNumber(xu_item.confidence);
    if (xu_conf === null) {
        xu_errors.push('confidence 缺失或非数字');
        xu_conf = 0;
    } else if (xu_conf > 1 && xu_conf <= 100) {
        xu_conf = xu_conf / 100;      // 兼容模型输出百分数
    }
    xu_conf = Math.round(Math.max(0, Math.min(1, xu_conf)) * 100) / 100;

    const xu_aspects = xu_normalizeAspects(xu_item.aspects);
    if (!xu_aspects.length) xu_errors.push('aspects 为空或类型不符');

    const xu_entities = xu_normalizeEntities(xu_item.entities);

    const xu_summary = String(xu_item.summary == null ? '' : xu_item.summary).trim().slice(0, 60);
    if (!xu_summary) xu_errors.push('summary 为空');

    const xu_needReview = xu_toBool(xu_item.need_review) || xu_conf < 0.6 || xu_errors.length > 0;

    return {
        value: {
            sentiment: xu_sent.cn,
            confidence: xu_conf,
            score: xu_sent.cn ? Math.round(XU_SENTIMENT_DIRECTION[xu_sent.cn] * xu_conf * 100) / 100 : null,
            aspects: xu_aspects,
            entities: xu_entities,
            summary: xu_summary || '模型未给出摘要',
            need_review: xu_needReview,
            featured: xu_toBool(xu_item.featured),
            invalid: xu_errors.length > 0
        },
        errors: xu_errors
    };
}

/**
 * 批量校验模型输出，与输入评论按 no 对齐
 * @returns {{list:Array, invalid:number, errors:string[]}}
 */
function xu_validateResults(xu_comments, xu_modelResults) {
    const xu_map = new Map();
    const xu_errors = [];
    let xu_invalid = 0;

    (Array.isArray(xu_modelResults) ? xu_modelResults : []).forEach(function (xu_item) {
        if (!xu_item || typeof xu_item !== 'object') return;

        const xu_no = Number(xu_item.no);
        if (!Number.isFinite(xu_no) || xu_map.has(xu_no)) return;

        const xu_r = xu_validateItem(xu_item);
        if (xu_r.errors.length) {
            xu_invalid += 1;
            xu_errors.push('#' + xu_no + ' ' + xu_r.errors.join('、'));
        }
        xu_r.value.no = xu_no;
        xu_map.set(xu_no, xu_r.value);
    });

    const xu_list = xu_comments.map(function (xu_c) {
        const xu_hit = xu_map.get(xu_c.no);

        if (!xu_hit) {
            xu_invalid += 1;
            xu_errors.push('#' + xu_c.no + ' 模型未返回该条结果');
            return {
                no: xu_c.no,
                content: xu_c.content,
                sentiment: null,
                confidence: 0,
                score: null,
                aspects: [],
                entities: [],
                summary: '模型未返回该条结果，已标记人工复核',
                need_review: true,
                featured: false,
                invalid: true
            };
        }

        return {
            no: xu_c.no,
            content: xu_c.content,
            sentiment: xu_hit.sentiment,
            confidence: xu_hit.confidence,
            score: xu_hit.score,
            aspects: xu_hit.aspects,
            entities: xu_hit.entities,
            summary: xu_hit.summary,
            need_review: xu_hit.need_review,
            featured: xu_hit.featured,
            invalid: xu_hit.invalid
        };
    });

    // 精选数量超限时保留置信度最高的若干条
    const xu_featuredList = xu_list.filter(function (xu_x) { return xu_x.featured; });
    if (xu_featuredList.length > XU_MAX_FEATURED) {
        xu_featuredList
            .slice()
            .sort(function (a, b) { return a.confidence - b.confidence; })
            .slice(0, xu_featuredList.length - XU_MAX_FEATURED)
            .forEach(function (xu_x) { xu_x.featured = false; });
    }

    return { list: xu_list, invalid: xu_invalid, errors: xu_errors };
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
                xu_c.summary,
                xu_c.confidence,
                JSON.stringify(xu_c.aspects || []),
                JSON.stringify(xu_c.entities || []),
                xu_c.need_review ? 1 : 0,
                xu_c.featured ? 1 : 0
            ];
        });

        await xu_conn.query(
            'INSERT INTO xu_comment (xu_file_id, xu_no, xu_content, xu_sentiment, xu_score,' +
            ' xu_summary, xu_confidence, xu_aspects, xu_entities, xu_need_review, xu_featured) VALUES ?',
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

    const xu_systemPrompt = '你是电商评论情感分析专家。你的唯一任务是按约定字段输出结构化 JSON，' +
        '字段名、字段类型、枚举取值必须与约定完全一致，不输出任何解释、注释或 markdown 代码块标记。';

    let xu_attempt = 0;
    let xu_response = null;
    let xu_checked = null;

    // 结构化输出：校验不通过时自动重试一次
    while (xu_attempt <= XU_MAX_RETRY) {
        const xu_prompt = xu_buildPrompt(xu_comments, xu_attempt > 0);

        xu_response = await xu_llm.xu_callLLM([
            { role: 'system', content: xu_systemPrompt },
            { role: 'user', content: xu_prompt }
        ], {
            temperature: xu_attempt > 0 ? 0.1 : 0.2,
            tag: xu_attempt > 0 ? '评论情感分类-重试' : '评论情感分类'
        });

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

        let xu_data = null;
        try {
            xu_data = xu_extractJSON(xu_content);
        } catch (xu_parseErr) {
            xu_data = null;
        }

        if (!xu_data || !Array.isArray(xu_data.results)) {
            console.warn('[结构化输出校验] 第 ' + (xu_attempt + 1) + ' 次调用返回内容不是合法 JSON 对象，' +
                (xu_attempt < XU_MAX_RETRY ? '准备自动重试' : '已无重试次数'));
            xu_checked = null;
        } else {
            xu_checked = xu_validateResults(xu_comments, xu_data.results);

            const xu_validRatio = xu_comments.length
                ? (xu_comments.length - xu_checked.invalid) / xu_comments.length
                : 0;

            console.log('[结构化输出校验] 第 ' + (xu_attempt + 1) + ' 次调用：字段校验通过率 ' +
                (xu_validRatio * 100).toFixed(1) + '%，异常 ' + xu_checked.invalid + ' 条');

            if (xu_checked.errors.length) {
                console.warn('[结构化输出校验明细]', xu_checked.errors);
            }

            if (xu_validRatio >= XU_VALID_RATIO) break;
            if (xu_attempt >= XU_MAX_RETRY) break;

            console.warn('[结构化输出校验] 通过率低于 ' + (XU_VALID_RATIO * 100) + '%，自动重试');
        }

        xu_attempt += 1;
    }

    const xu_retried = xu_attempt > 0;
    let xu_fallback = false;

    // 兜底：两次调用均失败时返回可展示的占位结果，全部标记人工复核
    if (!xu_checked) {
        xu_fallback = true;
        xu_checked = {
            list: xu_comments.map(function (xu_c) {
                return {
                    no: xu_c.no,
                    content: xu_c.content,
                    sentiment: null,
                    confidence: 0,
                    score: null,
                    aspects: [],
                    entities: [],
                    summary: '模型输出无法解析，已标记人工复核',
                    need_review: true,
                    featured: false,
                    invalid: true
                };
            }),
            invalid: xu_comments.length,
            errors: ['模型输出无法解析为约定 JSON']
        };
    }

    const xu_results = xu_checked.list;

    const xu_summary = { '好评': 0, '中评': 0, '差评': 0 };
    const xu_aspectCount = new Map();
    let xu_confSum = 0;
    let xu_needReview = 0;

    xu_results.forEach(function (xu_r) {
        if (xu_r.sentiment && xu_summary[xu_r.sentiment] !== undefined) {
            xu_summary[xu_r.sentiment] += 1;
        }
        xu_confSum += xu_r.confidence || 0;
        if (xu_r.need_review) xu_needReview += 1;

        (xu_r.aspects || []).forEach(function (xu_a) {
            xu_aspectCount.set(xu_a, (xu_aspectCount.get(xu_a) || 0) + 1);
        });
    });

    // 维度热度 Top5，用于前端展示评论关注点
    const xu_topAspects = Array.from(xu_aspectCount.entries())
        .map(function (xu_pair) { return { name: xu_pair[0], count: xu_pair[1] }; })
        .sort(function (a, b) { return b.count - a.count; })
        .slice(0, 5);

    const xu_featured = xu_results
        .filter(function (xu_r) { return xu_r.featured; })
        .sort(function (a, b) { return b.confidence - a.confidence; });

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
        topAspects: xu_topAspects,
        avgConfidence: xu_results.length ? Math.round(xu_confSum / xu_results.length * 100) / 100 : 0,
        needReview: xu_needReview,
        invalid: xu_checked.invalid,
        retried: xu_retried,
        fallback: xu_fallback,
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
