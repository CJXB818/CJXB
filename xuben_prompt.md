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

