# xuben_prompt.md -- AI 开发指令记录

> 姓名：【徐奔】 | 学号：【24001011011】
> 本文件按时间顺序追加记录每次向 AI 发出的开发指令，禁止覆盖已有内容。

---

## 2026-11-12 15:50 | DeepSeek-V4.1-Flash

**提示词全文：**

```
创建AI聊天页面。
Model ID: qiniu/conatus-free
Api-key: sk-****（密钥见 backend/.env，不在此记录）
OpenAI BaseURL: https://api.qnaigc.com/v1, 在控制台里输出发送给大模型的数据和从大模型接收到的数据。
```

---

## 2026-11-16 15:35 | DeepSeek-V4.1-Flash

**提示词全文：**

```
完成商业评论情感分类功能  用户上传excel文件 文件里若干商业评论 llm对每条评论进行分类 好评 中评 差评 前端接受llm返回的数据 显示为饼状图 显示精选评论 生成3个excel模拟数据文件 每个有20条数据 大模型发送和接受的数据都在控制台显示
```

---

## 2026-11-16 16:20 | DeepSeek-V4.1-Flash

**提示词全文：**

```
帮我连接到硅基流动网站deepseek-ai/DeepSeek-V4.1-Flash的API
```

**处理结果：** 将 `backend/.env` 的 `LLM_BASE_URL` 改为 `https://api.siliconflow.cn/v1`、`LLM_MODEL` 改为 `deepseek-ai/DeepSeek-V4.1-Flash`，密钥写入 `.env`（不入库）；新增 `backend/xu_check_key.js` 用于凭据自检。

---

## 2026-11-16 16:35 | DeepSeek-V4.1-Flash

**提示词全文：**

```
帮我上传到github
```

**处理结果：** 核对工作区与远程引用，`main` 与 `origin/main`、`origin/master` 均指向 `f119e51`，无待提交改动；追加本条记录后提交并推送到 `CJXB818/CJXB`（main 与 main:master）。

---

## 2026-11-16 16:40 | DeepSeek-V4.1-Flash

**提示词全文：**

```
@LLM应用设计-项目报告.doc  @LLM应用设计-实验指导书.docx  帮我根据指导书完成项目和报告
```

**处理结果：** 依据实验指导书「Harness Engineering」方向补全项目与报告。
1. 后端 `xu_comment.js`：提示词改为「角色 → 任务 → 字段约定（JSON Schema）→ 分类标准 → 少样本示例 → 评论列表」，输出字段升级为 sentiment / confidence / aspects / entities / summary / need_review / featured；新增逐条字段校验、通过率低于 80% 自动重试一次、两次失败返回兜底结果；新增维度热度 Top5、平均置信度、待复核数量统计。
2. 数据库：`xu_comment` 新增 `xu_summary`、`xu_confidence`、`xu_aspects`、`xu_entities`、`xu_need_review` 五个字段，回填 16 条历史测试数据，并追加记录到 `backend/xu_database.md`。
3. 前端：新增平均置信度、待人工复核统计卡片与维度热度条形图，精选评论与明细表补充置信度、维度标签、实体标签、摘要与待复核标记。
4. 文档：新增根目录 `README.md`（环境要求、启动步骤、配置项、功能清单、测试命令）；`backend/xu_interface.md` 追加结构化输出升级说明与校验容错策略。
5. 测试：curl 覆盖正常上传、空内容行、超长评论、特殊字符、无评论列、非 Excel、缺少文件字段、404 共 9 个用例，全部通过并留存截图。
6. 报告：生成 `_reports/24001011011-徐奔-LLM应用设计项目报告.docx`（11 页），含架构图、应用截图、提示词与模型返回截图、控制台截图、测试用例表与项目总结。

