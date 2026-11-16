# xu_interface.md -- 接口变更记录

> 姓名：【徐奔】 | 学号：【24001011011】
> 服务地址：http://localhost:8011，所有接口以 /api/ 为前缀，统一响应格式 `{ "code": 0, "msg": "...", "data": {...} }`。
> 本文件按时间顺序追加，禁止覆盖已有内容。

---

## 2026-11-12 15:50 · POST /api/chat

| 项目 | 内容 |
|---|---|
| 接口路径 | `/api/chat` |
| HTTP 方法 | `POST` |
| 修改时间 | 2026-11-12 15:50 |

**请求参数（application/json）**

```json
{
  "messages": [
    { "role": "system", "content": "你是一个中文 AI 助手" },
    { "role": "user", "content": "你好" }
  ],
  "temperature": 0.7
}
```

**响应格式（成功）**

```json
{
  "code": 0,
  "msg": "请求成功",
  "data": {
    "content": "你好，有什么可以帮你？",
    "model": "qiniu/conatus-free",
    "usage": { "prompt_tokens": 20, "completion_tokens": 12, "total_tokens": 32 }
  }
}
```

**响应格式（失败）**

```json
{ "code": 401, "msg": "Invalid API key", "data": { "error": { "message": "Invalid API key" } } }
```

> 后端控制台会打印 `[发送给大模型]` 与 `[从大模型接收]` 两段完整数据。

---

## 2026-11-16 15:40 · GET /api/health

| 项目 | 内容 |
|---|---|
| 接口路径 | `/api/health` |
| HTTP 方法 | `GET` |
| 修改时间 | 2026-11-16 15:40 |

**请求参数**：无

**响应格式**

```json
{
  "code": 0,
  "msg": "服务正常",
  "data": {
    "model": "qiniu/conatus-free",
    "baseUrl": "https://api.qnaigc.com/v1",
    "hasApiKey": true,
    "port": 8011,
    "dbConnected": true,
    "dbName": "xu_sentiment"
  }
}
```

---

## 2026-11-16 15:45 · POST /api/comment/analyze

| 项目 | 内容 |
|---|---|
| 接口路径 | `/api/comment/analyze` |
| HTTP 方法 | `POST` |
| 修改时间 | 2026-11-16 15:45 |

**请求参数（multipart/form-data）**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| file | File | 是 | `.xlsx` / `.xls` 文件，≤ 5MB，需包含「评论内容」列 |

示例（curl）：

```bash
curl -X POST -F "file=@frontend/downloads/示例数据1-生鲜电商.xlsx" \
  http://localhost:8011/api/comment/analyze
```

Excel 列格式示例（第一行为表头）：

| 序号 | 商品名称 | 评论内容 | 评分 |
|---|---|---|---|
| 1 | 车厘子 2J 礼盒装 | 包装很用心，冰袋还没化，车厘子又大又甜 | 5 |

**响应格式（成功）**

```json
{
  "code": 0,
  "msg": "分析完成，共 20 条评论",
  "data": {
    "fileId": 9,
    "fileName": "示例数据1-生鲜电商.xlsx",
    "total": 20,
    "truncated": false,
    "summary": { "好评": 10, "中评": 5, "差评": 5 },
    "model": "qiniu/conatus-free",
    "usage": { "prompt_tokens": 512, "completion_tokens": 386, "total_tokens": 898 },
    "comments": [
      {
        "no": 1,
        "content": "包装很用心，冰袋还没化，车厘子又大又甜，果柄都是绿的，下次还来买",
        "sentiment": "好评",
        "score": 0.9,
        "reason": "明确肯定口感与包装，复购意愿强",
        "featured": true
      }
    ],
    "featured": [
      {
        "no": 1,
        "content": "包装很用心，冰袋还没化，车厘子又大又甜，果柄都是绿的，下次还来买",
        "sentiment": "好评",
        "score": 0.9,
        "reason": "明确肯定口感与包装，复购意愿强",
        "featured": true
      }
    ]
  }
}
```

**响应格式（文件不合法）**

```json
{ "code": 400, "msg": "未在文件中解析到评论内容，请确认存在「评论内容」列且内容非空", "data": null }
```

**响应格式（大模型失败）**

```json
{
  "code": 401,
  "msg": "大模型调用失败：Invalid API key",
  "data": {
    "parsedTotal": 20,
    "detail": { "error": { "message": "Invalid API key", "type": "authentication_error", "code": "auth_api_key_invalid" } }
  }
}
```

> 分析上限 60 条/次；精选评论最多 6 条；分类结果与统计同时写入 MySQL（`xu_comment_file`、`xu_comment`）。

---

## 2026-11-16 16:15 · POST /api/comment/analyze（结构化输出升级）

| 项目 | 内容 |
|---|---|
| 接口路径 | `/api/comment/analyze` |
| HTTP 方法 | `POST` |
| 修改时间 | 2026-11-16 16:15 |
| 变更说明 | 按 Harness Engineering 要求，模型输出由「情感 + 得分 + 理由」升级为完整 JSON 结构，新增置信度、评论维度、实体、摘要、人工复核标记，并在后端完成字段校验、自动重试与兜底 |

**请求参数**：与上一版一致（`multipart/form-data`，字段 `file`），无需改动。

**响应格式（成功，节选）**

```json
{
  "code": 0,
  "msg": "分析完成，共 20 条评论",
  "data": {
    "fileId": 24,
    "fileName": "示例数据3-餐饮外卖.xlsx",
    "total": 20,
    "truncated": false,
    "summary": { "好评": 8, "中评": 6, "差评": 6 },
    "topAspects": [
      { "name": "口味", "count": 11 },
      { "name": "客服", "count": 10 },
      { "name": "质量", "count": 7 }
    ],
    "avgConfidence": 0.86,
    "needReview": 0,
    "invalid": 0,
    "retried": false,
    "fallback": false,
    "model": "deepseek-ai/DeepSeek-V4.1-Flash",
    "usage": { "prompt_tokens": 1055, "completion_tokens": 2562, "total_tokens": 3620 },
    "comments": [
      {
        "no": 1,
        "content": "牛油锅底很香，毛肚脆爽量足，服务员加汤很及时",
        "sentiment": "好评",
        "confidence": 0.95,
        "score": 0.95,
        "aspects": ["口味", "质量"],
        "entities": [
          { "name": "牛油锅底", "type": "product" },
          { "name": "服务员", "type": "person" }
        ],
        "summary": "锅底香毛肚脆量足，加汤及时",
        "need_review": false,
        "featured": true,
        "invalid": false
      }
    ],
    "featured": []
  }
}
```

**新增响应字段说明**

| 字段 | 类型 | 说明 |
|---|---|---|
| `topAspects` | array | 评论关注维度 Top5 及出现次数 |
| `avgConfidence` | number | 全部评论的平均置信度，保留两位小数 |
| `needReview` | number | 需人工复核的评论条数 |
| `invalid` | number | 字段校验未通过的条数 |
| `retried` | boolean | 是否因校验未通过而自动重试 |
| `fallback` | boolean | 是否返回兜底结果（两次调用均无法解析为约定 JSON） |
| `comments[].confidence` | number | 模型置信度 0~1 |
| `comments[].aspects` | string[] | 评论涉及维度（1~3 个） |
| `comments[].entities` | object[] | 实体列表，元素为 `{ name, type }`，`type` 取 `brand/product/service/logistics/person/other` |
| `comments[].summary` | string | 一句话中文摘要（≤30 字） |
| `comments[].need_review` | boolean | 是否需人工复核（置信度 < 0.6、语义矛盾或字段异常时置 true） |
| `comments[].invalid` | boolean | 该条是否未通过字段校验 |

**模型输出约定（提示词中的 JSON Schema）**

```json
{
  "results": [
    {
      "no": 1,
      "sentiment": "positive",
      "confidence": 0.93,
      "aspects": ["包装", "口味"],
      "entities": [{ "name": "车厘子", "type": "product" }],
      "summary": "包装保鲜到位，口感满意",
      "need_review": false,
      "featured": true
    }
  ]
}
```

**校验与容错策略**

1. 剥离可能的 ```json 代码块标记与前后说明文字，只取最外层 `{}` 解析。
2. 逐条校验：`sentiment` 必须为 `positive/neutral/negative`（兼容中文值），`confidence` 必须为 0~1 数字（兼容百分数），
   `aspects` 必须为非空字符串数组，`summary` 非空，`entities` 元素必须含 `name`，`type` 越界回落为 `other`。
3. 字段校验通过率 < 80%，或返回内容不是合法 JSON 时，追加纠正指令自动重试一次（`temperature` 由 0.2 降至 0.1）。
4. 两次调用仍失败：返回兜底结果（`fallback = true`），全部评论 `need_review = true`，前端提示人工复核。
5. 校验详情打印到后端终端（`[结构化输出校验]` / `[结构化输出校验明细]`）。

**响应格式（兜底结果，节选）**

```json
{
  "code": 0,
  "msg": "分析完成，共 20 条评论",
  "data": {
    "total": 20,
    "fallback": true,
    "needReview": 20,
    "comments": [
      {
        "no": 1,
        "content": "……",
        "sentiment": null,
        "confidence": 0,
        "aspects": [],
        "entities": [],
        "summary": "模型输出无法解析，已标记人工复核",
        "need_review": true,
        "featured": false,
        "invalid": true
      }
    ]
  }
}
```

