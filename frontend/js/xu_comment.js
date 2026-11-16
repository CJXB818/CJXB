/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash
 * 说明：商业评论情感分析交互，变量与函数名统一 xu_ 前缀
 */

(function () {
    'use strict';

    var xu_apiUrl = '/api/comment/analyze';

    var xu_state = {
        file: null,
        result: null,
        animId: 0
    };

    var xu_el = {
        drop: document.getElementById('xuDrop'),
        file: document.getElementById('xuFile'),
        fileName: document.getElementById('xuFileName'),
        analyze: document.getElementById('xuAnalyze'),
        hint: document.getElementById('xuHint'),
        alert: document.getElementById('xuAlert'),
        result: document.getElementById('xuResult'),
        total: document.getElementById('xuTotal'),
        good: document.getElementById('xuGood'),
        mid: document.getElementById('xuMid'),
        bad: document.getElementById('xuBad'),
        pie: document.getElementById('xuPie'),
        legend: document.getElementById('xuLegend'),
        featured: document.getElementById('xuFeatured'),
        tbody: document.getElementById('xuTbody')
    };

    var xu_colors = {
        '好评': '#34d399',
        '中评': '#fbbf24',
        '差评': '#f87171'
    };

    var xu_badgeClass = {
        '好评': 'xu_badge_good',
        '中评': 'xu_badge_mid',
        '差评': 'xu_badge_bad'
    };

    /* ---------------- 工具 ---------------- */
    function xu_now() {
        return new Date().toLocaleTimeString('zh-CN');
    }

    function xu_showAlert(text, type) {
        xu_el.alert.className = 'xu_alert xu_alert_show' + (type ? ' xu_alert_' + type : '');
        xu_el.alert.textContent = text;
    }

    function xu_hideAlert() {
        xu_el.alert.className = 'xu_alert';
        xu_el.alert.textContent = '';
    }

    function xu_formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    /* ---------------- 文件选择 ---------------- */
    function xu_selectFile(file) {
        if (!file) return;

        if (!/\.(xlsx|xls)$/i.test(file.name)) {
            xu_showAlert('只支持 .xlsx / .xls 格式的 Excel 文件', 'error');
            console.error('[文件类型不支持]', file.name);
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            xu_showAlert('文件超过 5MB 限制，请拆分后再上传', 'error');
            return;
        }

        xu_state.file = file;
        xu_el.fileName.textContent = file.name + ' · ' + xu_formatSize(file.size);
        xu_el.analyze.disabled = false;
        xu_hideAlert();

        console.log('[已选择文件] ' + xu_now(), {
            name: file.name,
            size: xu_formatSize(file.size),
            type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
    }

    xu_el.drop.addEventListener('click', function () {
        xu_el.file.click();
    });

    xu_el.file.addEventListener('change', function () {
        xu_selectFile(xu_el.file.files[0]);
    });

    ['dragenter', 'dragover'].forEach(function (xu_evt) {
        xu_el.drop.addEventListener(xu_evt, function (e) {
            e.preventDefault();
            xu_el.drop.classList.add('xu_drop_active');
        });
    });

    ['dragleave', 'drop'].forEach(function (xu_evt) {
        xu_el.drop.addEventListener(xu_evt, function (e) {
            e.preventDefault();
            xu_el.drop.classList.remove('xu_drop_active');
        });
    });

    xu_el.drop.addEventListener('drop', function (e) {
        var xu_file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        xu_selectFile(xu_file);
    });

    /* ---------------- 饼图绘制 ---------------- */
    function xu_drawPie(xu_progress) {
        var xu_canvas = xu_el.pie;
        var xu_ctx = xu_canvas.getContext('2d');
        var xu_cssSize = xu_canvas.clientWidth || 300;
        var xu_dpr = Math.min(window.devicePixelRatio || 1, 2);

        xu_canvas.width = Math.round(xu_cssSize * xu_dpr);
        xu_canvas.height = Math.round(xu_cssSize * xu_dpr);
        xu_ctx.setTransform(xu_dpr, 0, 0, xu_dpr, 0, 0);
        xu_ctx.clearRect(0, 0, xu_cssSize, xu_cssSize);

        var xu_cx = xu_cssSize / 2;
        var xu_cy = xu_cssSize / 2;
        var xu_rOuter = xu_cssSize * 0.42;
        var xu_rInner = xu_cssSize * 0.26;

        var xu_summary = (xu_state.result && xu_state.result.summary) || {};
        var xu_items = [
            { name: '好评', value: xu_summary['好评'] || 0 },
            { name: '中评', value: xu_summary['中评'] || 0 },
            { name: '差评', value: xu_summary['差评'] || 0 }
        ];

        var xu_total = xu_items.reduce(function (a, b) { return a + b.value; }, 0);

        // 底座圆环
        xu_ctx.beginPath();
        xu_ctx.arc(xu_cx, xu_cy, xu_rOuter, 0, Math.PI * 2);
        xu_ctx.arc(xu_cx, xu_cy, xu_rInner, 0, Math.PI * 2, true);
        xu_ctx.fillStyle = 'rgba(148,163,184,.1)';
        xu_ctx.fill();

        if (xu_total > 0) {
            var xu_start = -Math.PI / 2;
            var xu_gap = 0.022;

            xu_items.forEach(function (xu_item) {
                if (xu_item.value <= 0) return;

                var xu_angle = (xu_item.value / xu_total) * Math.PI * 2 * xu_progress;

                xu_ctx.beginPath();
                xu_ctx.arc(xu_cx, xu_cy, xu_rOuter, xu_start, xu_start + Math.max(xu_angle - xu_gap, 0.004));
                xu_ctx.arc(xu_cx, xu_cy, xu_rInner, xu_start + Math.max(xu_angle - xu_gap, 0.004), xu_start, true);
                xu_ctx.closePath();
                xu_ctx.fillStyle = xu_colors[xu_item.name];
                xu_ctx.fill();

                xu_start += xu_angle;
            });
        }

        // 中心文字
        xu_ctx.textAlign = 'center';
        xu_ctx.textBaseline = 'middle';
        xu_ctx.fillStyle = '#e8f1ff';
        xu_ctx.font = 'bold ' + Math.round(xu_cssSize * 0.09) + 'px Consolas, monospace';
        xu_ctx.fillText(String(xu_total), xu_cx, xu_cy - xu_cssSize * 0.03);

        xu_ctx.fillStyle = '#64748b';
        xu_ctx.font = Math.round(xu_cssSize * 0.036) + 'px "Microsoft YaHei", sans-serif';
        xu_ctx.fillText('条已分类', xu_cx, xu_cy + xu_cssSize * 0.06);
    }

    function xu_animatePie() {
        cancelAnimationFrame(xu_state.animId);

        var xu_t0 = performance.now();
        var xu_duration = 750;

        function xu_step(xu_t) {
            var xu_p = Math.min(1, (xu_t - xu_t0) / xu_duration);
            var xu_eased = 1 - Math.pow(1 - xu_p, 3);
            xu_drawPie(xu_eased);
            if (xu_p < 1) xu_state.animId = requestAnimationFrame(xu_step);
        }

        xu_state.animId = requestAnimationFrame(xu_step);
    }

    /* ---------------- 结果渲染 ---------------- */
    function xu_renderLegend() {
        var xu_summary = xu_state.result.summary;
        var xu_total = xu_state.result.total || 1;

        xu_el.legend.innerHTML = ['好评', '中评', '差评'].map(function (xu_key) {
            var xu_value = xu_summary[xu_key] || 0;
            var xu_pct = (xu_value / xu_total * 100).toFixed(1);
            return '<li>' +
                '<i style="background:' + xu_colors[xu_key] + '"></i>' +
                '<span>' + xu_key + '</span>' +
                '<span class="xu_legend_pct">' + xu_value + ' · ' + xu_pct + '%</span>' +
                '</li>';
        }).join('');
    }

    function xu_renderFeatured() {
        var xu_list = xu_state.result.featured || [];

        if (!xu_list.length) {
            xu_el.featured.innerHTML = '<p class="xu_hint">本次没有模型标记为精选的评论。</p>';
            return;
        }

        xu_el.featured.innerHTML = xu_list.map(function (xu_item) {
            var xu_cls = xu_badgeClass[xu_item.sentiment] || 'xu_badge_none';
            var xu_label = xu_item.sentiment || '未分类';
            var xu_score = typeof xu_item.score === 'number' ? xu_item.score.toFixed(2) : '—';

            return '<div class="xu_feature_item">' +
                '<div class="xu_feature_top">' +
                '<span class="xu_feature_no">#' + xu_item.no + '</span>' +
                '<span class="xu_badge ' + xu_cls + '">' + xu_label + '</span>' +
                '<span class="xu_feature_score">' + xu_score + '</span>' +
                '</div>' +
                '<p class="xu_feature_text">' + xu_escape(xu_item.content) + '</p>' +
                '<p class="xu_feature_reason">判定理由：' + xu_escape(xu_item.reason || '—') + '</p>' +
                '</div>';
        }).join('');
    }

    function xu_escape(xu_text) {
        return String(xu_text == null ? '' : xu_text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function xu_renderTable() {
        xu_el.tbody.innerHTML = xu_state.result.comments.map(function (xu_item) {
            var xu_cls = xu_badgeClass[xu_item.sentiment] || 'xu_badge_none';
            var xu_label = xu_item.sentiment || '未分类';
            var xu_score = typeof xu_item.score === 'number' ? xu_item.score.toFixed(2) : '—';

            return '<tr>' +
                '<td class="xu_cell_no">' + xu_item.no + '</td>' +
                '<td>' + xu_escape(xu_item.content) + '</td>' +
                '<td><span class="xu_badge ' + xu_cls + '">' + xu_label + '</span></td>' +
                '<td class="xu_cell_score">' + xu_score + '</td>' +
                '<td class="xu_cell_reason">' + xu_escape(xu_item.reason || '—') + '</td>' +
                '<td>' + (xu_item.featured ? '<span class="xu_star">★</span>' : '') + '</td>' +
                '</tr>';
        }).join('');
    }

    function xu_renderResult() {
        var xu_data = xu_state.result;

        xu_el.total.textContent = xu_data.total;
        xu_el.good.textContent = xu_data.summary['好评'] || 0;
        xu_el.mid.textContent = xu_data.summary['中评'] || 0;
        xu_el.bad.textContent = xu_data.summary['差评'] || 0;

        xu_el.result.hidden = false;
        xu_renderLegend();
        xu_renderFeatured();
        xu_renderTable();
        xu_animatePie();
    }

    /* ---------------- 发起分析 ---------------- */
    async function xu_analyze() {
        if (!xu_state.file) {
            xu_showAlert('请先选择要分析的 Excel 文件', 'error');
            return;
        }

        xu_el.analyze.disabled = true;
        xu_el.analyze.textContent = '分析中…';
        xu_showAlert('正在上传并调用大模型逐条分类，请稍候（20 条评论通常需要 10~40 秒）…', 'info');

        var xu_formData = new FormData();
        xu_formData.append('file', xu_state.file);

        console.log('[发送给大模型] ' + xu_now() + ' 前端上传文件，完整提示词由后端组装并打印在后端控制台', {
            api: xu_apiUrl,
            fileName: xu_state.file.name,
            fileSize: xu_formatSize(xu_state.file.size)
        });

        try {
            var xu_resp = await fetch(xu_apiUrl, {
                method: 'POST',
                body: xu_formData
            });

            var xu_result = await xu_resp.json();

            // 控制台输出：从大模型接收到的数据（经后端整理）
            console.log('[从大模型接收] ' + xu_now(), xu_result);

            if (xu_result.code !== 0) {
                var xu_msg = xu_result.msg || '分析失败';
                if (/API key/i.test(xu_msg)) {
                    xu_msg += '（请在 backend/.env 中更新 LLM_API_KEY 后重启服务）';
                }
                if (xu_result.data && xu_result.data.parsedTotal) {
                    xu_msg += '｜已解析 ' + xu_result.data.parsedTotal + ' 条评论，但未获得分类结果';
                }
                xu_showAlert(xu_msg, 'error');
                console.error('[接口返回错误]', xu_result);
                return;
            }

            xu_state.result = xu_result.data;
            xu_hideAlert();
            xu_renderResult();

            console.log('[分析完成] ' + xu_now(), {
                文件: xu_result.data.fileName,
                总数: xu_result.data.total,
                统计: xu_result.data.summary,
                精选数: xu_result.data.featured.length,
                usage: xu_result.data.usage
            });
        } catch (xu_err) {
            xu_showAlert('请求失败：' + xu_err.message, 'error');
            console.error('[请求异常]', xu_err);
        } finally {
            xu_el.analyze.disabled = false;
            xu_el.analyze.textContent = '开始分析';
        }
    }

    xu_el.analyze.addEventListener('click', xu_analyze);

    /* ---------------- 自适应 ---------------- */
    var xu_resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(xu_resizeTimer);
        xu_resizeTimer = setTimeout(function () {
            if (xu_state.result) xu_drawPie(1);
        }, 160);
    });
})();
