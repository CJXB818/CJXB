/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-12 | 大模型：DeepSeek-V4.1-Flash
 * 说明：AI 聊天页面交互逻辑，变量与函数名统一 xu_ 前缀
 */

(function () {
    'use strict';

    var xu_apiUrl = '/api/chat';

    // 对话历史：system 提示 + 多轮 user/assistant，每次整体发给后端
    var xu_history = [
        {
            role: 'system',
            content: '你是一个热情、条理清晰的中文 AI 助手。回答尽量简洁，必要时使用分点说明。'
        }
    ];

    var xu_sending = false;

    var xu_messagesEl = document.getElementById('xuMessages');
    var xu_mainEl = document.getElementById('xuMain');
    var xu_inputEl = document.getElementById('xuInput');
    var xu_sendBtn = document.getElementById('xuSend');
    var xu_clearBtn = document.getElementById('xuClear');
    var xu_statusEl = document.getElementById('xuStatus');
    var xu_statusTextEl = document.getElementById('xuStatusText');

    /* ---------------- 工具函数 ---------------- */
    function xu_now() {
        return new Date().toLocaleTimeString('zh-CN');
    }

    function xu_setStatus(text, type) {
        xu_statusTextEl.textContent = text;
        xu_statusEl.classList.remove('xu_is_busy', 'xu_is_error');
        if (type === 'busy') xu_statusEl.classList.add('xu_is_busy');
        if (type === 'error') xu_statusEl.classList.add('xu_is_error');
    }

    function xu_scrollToBottom() {
        xu_mainEl.scrollTop = xu_mainEl.scrollHeight;
    }

    function xu_autoGrow() {
        xu_inputEl.style.height = 'auto';
        xu_inputEl.style.height = Math.min(xu_inputEl.scrollHeight, 140) + 'px';
    }

    /* ---------------- 渲染 ---------------- */
    function xu_createRow(role, text) {
        var xu_row = document.createElement('div');
        xu_row.className = 'xu_row xu_row_' + role;

        var xu_avatar = document.createElement('div');
        xu_avatar.className = 'xu_avatar';
        xu_avatar.textContent = role === 'user' ? '我' : (role === 'error' ? '!' : 'AI');

        var xu_bubble = document.createElement('div');
        xu_bubble.className = 'xu_bubble';
        xu_bubble.textContent = text;

        xu_row.appendChild(xu_avatar);
        xu_row.appendChild(xu_bubble);
        return xu_row;
    }

    function xu_addBubble(role, text) {
        xu_messagesEl.appendChild(xu_createRow(role, text));
        xu_scrollToBottom();
    }

    function xu_addTyping() {
        var xu_row = document.createElement('div');
        xu_row.className = 'xu_row xu_row_assistant';

        var xu_avatar = document.createElement('div');
        xu_avatar.className = 'xu_avatar';
        xu_avatar.textContent = 'AI';

        var xu_bubble = document.createElement('div');
        xu_bubble.className = 'xu_bubble';

        var xu_typing = document.createElement('span');
        xu_typing.className = 'xu_typing';
        xu_typing.innerHTML = '<i></i><i></i><i></i>';

        xu_bubble.appendChild(xu_typing);
        xu_row.appendChild(xu_avatar);
        xu_row.appendChild(xu_bubble);

        xu_messagesEl.appendChild(xu_row);
        xu_scrollToBottom();
        return xu_row;
    }

    function xu_removeRow(row) {
        if (row && row.parentNode) row.parentNode.removeChild(row);
    }

    function xu_renderWelcome() {
        xu_messagesEl.innerHTML = '';

        var xu_welcome = document.createElement('div');
        xu_welcome.className = 'xu_welcome';

        var xu_title = document.createElement('h2');
        xu_title.textContent = '你好，我是 AI 助手';

        var xu_desc = document.createElement('p');
        xu_desc.textContent = '基于 qiniu/conatus-free 模型，请求由本地后端 /api/chat 转发。可以试试下面的问题，或直接输入。';

        var xu_suggest = document.createElement('div');
        xu_suggest.className = 'xu_suggest';

        var xu_questions = [
            '用三句话介绍你自己',
            '用 JavaScript 写一个节流函数',
            '解释一下什么是 RESTful 接口',
            '帮我写一段 100 字的产品文案'
        ];

        xu_questions.forEach(function (xu_q) {
            var xu_btn = document.createElement('button');
            xu_btn.type = 'button';
            xu_btn.textContent = xu_q;
            xu_btn.addEventListener('click', function () {
                xu_inputEl.value = xu_q;
                xu_autoGrow();
                xu_inputEl.focus();
            });
            xu_suggest.appendChild(xu_btn);
        });

        xu_welcome.appendChild(xu_title);
        xu_welcome.appendChild(xu_desc);
        xu_welcome.appendChild(xu_suggest);
        xu_messagesEl.appendChild(xu_welcome);
    }

    /* ---------------- 发送消息 ---------------- */
    async function xu_sendMessage() {
        var xu_text = xu_inputEl.value.trim();
        if (!xu_text || xu_sending) return;

        // 首次发送时移除欢迎区
        var xu_welcome = xu_messagesEl.querySelector('.xu_welcome');
        if (xu_welcome) xu_welcome.remove();

        xu_sending = true;
        xu_sendBtn.disabled = true;
        xu_inputEl.value = '';
        xu_autoGrow();

        xu_addBubble('user', xu_text);
        xu_history.push({ role: 'user', content: xu_text });

        var xu_typingRow = xu_addTyping();
        xu_setStatus('思考中…', 'busy');

        var xu_payload = {
            messages: xu_history.slice()
        };

        // 控制台输出：发送给大模型的数据
        console.log('%c[发送给大模型] ' + xu_now(), 'color:#38bdf8;font-weight:bold', xu_payload);

        try {
            var xu_resp = await fetch(xu_apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(xu_payload)
            });

            var xu_result = await xu_resp.json();

            // 控制台输出：从大模型接收到的数据
            console.log('%c[从大模型接收] ' + xu_now(), 'color:#34d399;font-weight:bold', xu_result);

            xu_removeRow(xu_typingRow);

            if (xu_result.code !== 0) {
                var xu_msg = xu_result.msg || ('请求失败（code=' + xu_result.code + '）');
                xu_addBubble('error', xu_msg);
                console.error('[接口返回错误]', xu_result);
                xu_setStatus('请求失败', 'error');
                return;
            }

            var xu_answer = (xu_result.data && xu_result.data.content) || '（模型没有返回内容）';
            xu_addBubble('assistant', xu_answer);
            xu_history.push({ role: 'assistant', content: xu_answer });
            xu_setStatus('已就绪', 'ok');
        } catch (xu_err) {
            xu_removeRow(xu_typingRow);
            xu_addBubble('error', '请求异常：' + xu_err.message);
            console.error('[请求异常]', xu_err);
            xu_setStatus('连接失败', 'error');
        } finally {
            xu_sending = false;
            xu_sendBtn.disabled = false;
            xu_inputEl.focus();
        }
    }

    /* ---------------- 事件绑定 ---------------- */
    xu_sendBtn.addEventListener('click', xu_sendMessage);

    xu_inputEl.addEventListener('keydown', function (e) {
        // Enter 发送，Shift + Enter 换行
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            xu_sendMessage();
        }
    });

    xu_inputEl.addEventListener('input', xu_autoGrow);

    xu_clearBtn.addEventListener('click', function () {
        xu_history = [
            {
                role: 'system',
                content: '你是一个热情、条理清晰的中文 AI 助手。回答尽量简洁，必要时使用分点说明。'
            }
        ];
        xu_renderWelcome();
        xu_setStatus('已就绪', 'ok');
        console.log('[对话已清空] ' + xu_now());
    });

    /* ---------------- 初始化 ---------------- */
    xu_renderWelcome();
    xu_autoGrow();
    xu_inputEl.focus();
})();
