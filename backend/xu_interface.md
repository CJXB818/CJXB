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
