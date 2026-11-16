/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：Qwen3-VL-32B-Instruct / SenseVoiceSmall
 * 说明：多模态识别页面交互，上传图片 / 语音 → 调用后端识别接口 → 渲染结构化结果
 */

(function () {
    'use strict';

    var XU_IMG_API = '/api/multimodal/image';
    var XU_AUDIO_API = '/api/multimodal/audio';
    var XU_IMG_DEMO = 'images/示例-评论截图.png';
    var XU_AUDIO_DEMO = 'downloads/示例-语音评论.wav';

    function xu_$(xu_id) {
        return document.getElementById(xu_id);
    }

    function xu_fmtSize(xu_bytes) {
        if (!xu_bytes && xu_bytes !== 0) return '-';
        if (xu_bytes < 1024) return xu_bytes + ' B';
        if (xu_bytes < 1024 * 1024) return (xu_bytes / 1024).toFixed(1) + ' KB';
        return (xu_bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    function xu_showAlert(xu_box, xu_type, xu_msg) {
        xu_box.className = 'xu_alert xu_show ' + (xu_type === 'error' ? 'xu_error' : 'xu_info');
        xu_box.textContent = xu_msg;
    }

    function xu_hideAlert(xu_box) {
        xu_box.className = 'xu_alert';
        xu_box.textContent = '';
    }

    function xu_badgeClass(xu_sentiment) {
        if (xu_sentiment === '好评') return 'xu_badge_good';
        if (xu_sentiment === '中评') return 'xu_badge_mid';
        if (xu_sentiment === '差评') return 'xu_badge_bad';
        return 'xu_badge_none';
    }

    function xu_chipClass(xu_sentiment) {
        if (xu_sentiment === '好评') return 'xu_chip_good';
        if (xu_sentiment === '中评') return 'xu_chip_mid';
        if (xu_sentiment === '差评') return 'xu_chip_bad';
        return '';
    }

    /* ---------------- 结果渲染（图片与语音共用） ---------------- */

    function xu_renderChips(xu_box, xu_data) {
        xu_box.innerHTML = '';

        const xu_items = [
            { cls: 'xu_chip_good', label: '好评', value: xu_data.summary['好评'] },
            { cls: 'xu_chip_mid', label: '中评', value: xu_data.summary['中评'] },
            { cls: 'xu_chip_bad', label: '差评', value: xu_data.summary['差评'] },
            { cls: '', label: '平均置信度', value: xu_data.avgConfidence },
            { cls: '', label: '待人工复核', value: xu_data.needReview }
        ];

        xu_items.forEach(function (xu_it) {
            const xu_el = document.createElement('span');
            xu_el.className = 'xu_chip ' + xu_it.cls;
            xu_el.innerHTML = xu_it.label + ' <b>' + xu_it.value + '</b>';
            xu_box.appendChild(xu_el);
        });
    }

    function xu_renderItems(xu_box, xu_comments) {
        xu_box.innerHTML = '';

        (xu_comments || []).forEach(function (xu_c) {
            const xu_card = document.createElement('div');
            xu_card.className = 'xu_item';

            const xu_head = document.createElement('div');
            xu_head.className = 'xu_item_head';

            const xu_badge = document.createElement('span');
            xu_badge.className = 'xu_badge ' + xu_badgeClass(xu_c.sentiment);
            xu_badge.textContent = xu_c.sentiment || '未判定';
            xu_head.appendChild(xu_badge);

            const xu_conf = document.createElement('span');
            xu_conf.className = 'xu_item_conf';
            xu_conf.textContent = '置信度 ' + (xu_c.confidence == null ? '-' : xu_c.confidence);
            xu_head.appendChild(xu_conf);

            if (xu_c.need_review) {
                const xu_flag = document.createElement('span');
                xu_flag.className = 'xu_review_flag';
                xu_flag.textContent = '待复核';
                xu_head.appendChild(xu_flag);
            }

            xu_card.appendChild(xu_head);

            const xu_text = document.createElement('p');
            xu_text.className = 'xu_item_text';
            xu_text.textContent = xu_c.content || '';
            xu_card.appendChild(xu_text);

            const xu_meta = document.createElement('p');
            xu_meta.className = 'xu_item_meta';
            const xu_aspects = (xu_c.aspects || []).join('、') || '无';
            const xu_entity = (xu_c.entities || []).map(function (xu_e) {
                return xu_e.name + '(' + xu_e.type + ')';
            }).join('、') || '无';
            xu_meta.textContent = '摘要：' + (xu_c.summary || '无') +
                ' ｜ 维度：' + xu_aspects + ' ｜ 实体：' + xu_entity;
            xu_card.appendChild(xu_meta);

            xu_box.appendChild(xu_card);
        });
    }

    /* ---------------- 图片识别 ---------------- */

    const xu_imgDrop = xu_$('xuImgDrop');
    const xu_imgInput = xu_$('xuImgFile');
    const xu_imgName = xu_$('xuImgName');
    const xu_imgPreview = xu_$('xuImgPreview');
    const xu_imgView = xu_$('xuImgView');
    const xu_imgRun = xu_$('xuImgRun');
    const xu_imgAlert = xu_$('xuImgAlert');
    const xu_imgResult = xu_$('xuImgResult');

    let xu_imgFile = null;
    let xu_imgUrl = null;

    function xu_setImage(xu_file) {
        if (!xu_file) return;

        if (!/^image\//.test(xu_file.type) && !/\.(png|jpe?g|webp|bmp|gif)$/i.test(xu_file.name)) {
            xu_showAlert(xu_imgAlert, 'error', '请选择图片文件（.png / .jpg / .webp / .bmp / .gif）');
            return;
        }
        if (xu_file.size > 5 * 1024 * 1024) {
            xu_showAlert(xu_imgAlert, 'error', '图片超过 5MB 限制，请压缩后再上传');
            return;
        }

        xu_imgFile = xu_file;
        xu_imgName.textContent = xu_file.name + ' · ' + xu_fmtSize(xu_file.size);
        xu_imgRun.disabled = false;
        xu_hideAlert(xu_imgAlert);

        if (xu_imgUrl) URL.revokeObjectURL(xu_imgUrl);
        xu_imgUrl = URL.createObjectURL(xu_file);
        xu_imgView.src = xu_imgUrl;
        xu_imgPreview.classList.add('xu_show');

        console.log('[已选择图片] ' + new Date().toLocaleTimeString('zh-CN'), {
            name: xu_file.name,
            size: xu_fmtSize(xu_file.size),
            type: xu_file.type
        });
    }

    async function xu_runImage() {
        if (!xu_imgFile) return;

        xu_imgRun.disabled = true;
        xu_showAlert(xu_imgAlert, 'info', '正在调用 Qwen3-VL-32B-Instruct 识别图片，通常需要 10~20 秒…');

        const xu_form = new FormData();
        xu_form.append('file', xu_imgFile);

        console.log('[图像识别请求] POST ' + XU_IMG_API, {
            fileName: xu_imgFile.name,
            size: xu_fmtSize(xu_imgFile.size)
        });

        try {
            const xu_resp = await fetch(XU_IMG_API, { method: 'POST', body: xu_form });
            const xu_json = await xu_resp.json();

            console.log('[图像识别响应] HTTP ' + xu_resp.status, xu_json);

            if (xu_json.code !== 0) {
                throw new Error(xu_json.msg || '识别失败');
            }

            xu_renderImage(xu_json.data);
            xu_hideAlert(xu_imgAlert);
            xu_imgResult.classList.add('xu_show');
        } catch (xu_err) {
            console.error('[图像识别失败]', xu_err.message);
            xu_showAlert(xu_imgAlert, 'error', '识别失败：' + xu_err.message);
        } finally {
            xu_imgRun.disabled = false;
        }
    }

    function xu_renderImage(xu_data) {
        const xu_kv = xu_$('xuImgKv');
        xu_kv.innerHTML = '';

        const xu_pairs = [
            ['图片主体', xu_data.subject || '-'],
            ['场景描述', xu_data.scene || '-'],
            ['清晰度', xu_data.clarity === 'blurry' ? '模糊' : '清晰'],
            ['关键词标签', (xu_data.tags || []).join('、') || '-'],
            ['识别模型', xu_data.visionModel],
            ['文件信息', xu_data.fileName + ' · ' + xu_fmtSize(xu_data.size)],
            ['记录编号', xu_data.recordId ? 'xu_multimodal #' + xu_data.recordId : '未入库']
        ];

        xu_pairs.forEach(function (xu_p) {
            const xu_dt = document.createElement('dt');
            xu_dt.textContent = xu_p[0];
            const xu_dd = document.createElement('dd');
            xu_dd.textContent = xu_p[1];
            xu_kv.appendChild(xu_dt);
            xu_kv.appendChild(xu_dd);
        });

        xu_$('xuImgOcr').textContent = xu_data.ocrText || '（模型未在图片中识别到文字）';
        xu_renderChips(xu_$('xuImgChips'), xu_data);
        xu_renderItems(xu_$('xuImgItems'), xu_data.comments);
    }

    xu_imgDrop.addEventListener('click', function () { xu_imgInput.click(); });
    xu_imgInput.addEventListener('change', function () {
        xu_setImage(xu_imgInput.files && xu_imgInput.files[0]);
    });
    ['dragenter', 'dragover'].forEach(function (xu_evt) {
        xu_imgDrop.addEventListener(xu_evt, function (xu_e) {
            xu_e.preventDefault();
            xu_imgDrop.classList.add('xu_drop_on');
        });
    });
    ['dragleave', 'drop'].forEach(function (xu_evt) {
        xu_imgDrop.addEventListener(xu_evt, function (xu_e) {
            xu_e.preventDefault();
            xu_imgDrop.classList.remove('xu_drop_on');
        });
    });
    xu_imgDrop.addEventListener('drop', function (xu_e) {
        const xu_file = xu_e.dataTransfer && xu_e.dataTransfer.files && xu_e.dataTransfer.files[0];
        xu_setImage(xu_file);
    });
    xu_imgRun.addEventListener('click', xu_runImage);

    xu_$('xuImgDemo').addEventListener('click', async function () {
        try {
            const xu_resp = await fetch(XU_IMG_DEMO);
            const xu_blob = await xu_resp.blob();
            xu_setImage(new File([xu_blob], '示例-评论截图.png', { type: xu_blob.type || 'image/png' }));
        } catch (xu_err) {
            xu_showAlert(xu_imgAlert, 'error', '示例图片加载失败：' + xu_err.message);
        }
    });

    /* ---------------- 语音识别 ---------------- */

    const xu_audioDrop = xu_$('xuAudioDrop');
    const xu_audioInput = xu_$('xuAudioFile');
    const xu_audioName = xu_$('xuAudioName');
    const xu_audioPreview = xu_$('xuAudioPreview');
    const xu_audioPlayer = xu_$('xuAudioPlayer');
    const xu_audioRun = xu_$('xuAudioRun');
    const xu_audioAlert = xu_$('xuAudioAlert');
    const xu_audioResult = xu_$('xuAudioResult');

    let xu_audioFile = null;
    let xu_audioUrl = null;

    function xu_setAudio(xu_file) {
        if (!xu_file) return;

        if (!/^audio\//.test(xu_file.type) && !/\.(wav|mp3|m4a|webm|ogg|flac|amr|aac)$/i.test(xu_file.name)) {
            xu_showAlert(xu_audioAlert, 'error', '请选择音频文件（.wav / .mp3 / .m4a / .webm / .ogg / .flac）');
            return;
        }
        if (xu_file.size > 10 * 1024 * 1024) {
            xu_showAlert(xu_audioAlert, 'error', '音频超过 10MB 限制，请裁剪后再上传');
            return;
        }

        xu_audioFile = xu_file;
        xu_audioName.textContent = xu_file.name + ' · ' + xu_fmtSize(xu_file.size);
        xu_audioRun.disabled = false;
        xu_hideAlert(xu_audioAlert);

        if (xu_audioUrl) URL.revokeObjectURL(xu_audioUrl);
        xu_audioUrl = URL.createObjectURL(xu_file);
        xu_audioPlayer.src = xu_audioUrl;
        xu_audioPreview.classList.add('xu_show');

        console.log('[已选择音频] ' + new Date().toLocaleTimeString('zh-CN'), {
            name: xu_file.name,
            size: xu_fmtSize(xu_file.size),
            type: xu_file.type
        });
    }

    async function xu_runAudio() {
        if (!xu_audioFile) return;

        xu_audioRun.disabled = true;
        xu_showAlert(xu_audioAlert, 'info', '正在调用 SenseVoiceSmall 转写语音并分类，通常需要 3~8 秒…');

        const xu_form = new FormData();
        xu_form.append('file', xu_audioFile);

        console.log('[语音识别请求] POST ' + XU_AUDIO_API, {
            fileName: xu_audioFile.name,
            size: xu_fmtSize(xu_audioFile.size)
        });

        try {
            const xu_resp = await fetch(XU_AUDIO_API, { method: 'POST', body: xu_form });
            const xu_json = await xu_resp.json();

            console.log('[语音识别响应] HTTP ' + xu_resp.status, xu_json);

            if (xu_json.code !== 0) {
                throw new Error(xu_json.msg || '识别失败');
            }

            xu_renderAudio(xu_json.data);
            xu_hideAlert(xu_audioAlert);
            xu_audioResult.classList.add('xu_show');
        } catch (xu_err) {
            console.error('[语音识别失败]', xu_err.message);
            xu_showAlert(xu_audioAlert, 'error', '识别失败：' + xu_err.message);
        } finally {
            xu_audioRun.disabled = false;
        }
    }

    function xu_renderAudio(xu_data) {
        xu_$('xuAudioText').textContent = xu_data.text || '（未转写出文字）';

        const xu_kv = xu_$('xuAudioKv');
        xu_kv.innerHTML = '';

        const xu_pairs = [
            ['识别语种', xu_data.language || '未知'],
            ['音频时长', xu_data.duration ? xu_data.duration + ' 秒' : '-'],
            ['语音模型', xu_data.asrModel],
            ['文件信息', xu_data.fileName + ' · ' + xu_fmtSize(xu_data.size)],
            ['记录编号', xu_data.recordId ? 'xu_multimodal #' + xu_data.recordId : '未入库']
        ];

        xu_pairs.forEach(function (xu_p) {
            const xu_dt = document.createElement('dt');
            xu_dt.textContent = xu_p[0];
            const xu_dd = document.createElement('dd');
            xu_dd.textContent = xu_p[1];
            xu_kv.appendChild(xu_dt);
            xu_kv.appendChild(xu_dd);
        });

        xu_renderChips(xu_$('xuAudioChips'), xu_data);
        xu_renderItems(xu_$('xuAudioItems'), xu_data.comments);
    }

    xu_audioDrop.addEventListener('click', function () { xu_audioInput.click(); });
    xu_audioInput.addEventListener('change', function () {
        xu_setAudio(xu_audioInput.files && xu_audioInput.files[0]);
    });
    ['dragenter', 'dragover'].forEach(function (xu_evt) {
        xu_audioDrop.addEventListener(xu_evt, function (xu_e) {
            xu_e.preventDefault();
            xu_audioDrop.classList.add('xu_drop_on');
        });
    });
    ['dragleave', 'drop'].forEach(function (xu_evt) {
        xu_audioDrop.addEventListener(xu_evt, function (xu_e) {
            xu_e.preventDefault();
            xu_audioDrop.classList.remove('xu_drop_on');
        });
    });
    xu_audioDrop.addEventListener('drop', function (xu_e) {
        const xu_file = xu_e.dataTransfer && xu_e.dataTransfer.files && xu_e.dataTransfer.files[0];
        xu_setAudio(xu_file);
    });
    xu_audioRun.addEventListener('click', xu_runAudio);

    xu_$('xuAudioDemo').addEventListener('click', async function () {
        try {
            const xu_resp = await fetch(XU_AUDIO_DEMO);
            const xu_blob = await xu_resp.blob();
            xu_setAudio(new File([xu_blob], '示例-语音评论.wav', { type: xu_blob.type || 'audio/wav' }));
        } catch (xu_err) {
            xu_showAlert(xu_audioAlert, 'error', '示例音频加载失败：' + xu_err.message);
        }
    });
})();
