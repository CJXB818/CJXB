<!--
  姓名：【徐奔】 | 学号：【24001011011】 |
  时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash
-->

# 商业评论情感分类系统（LLM 应用设计 · Harness Engineering）

后端中间层代理硅基流动 **deepseek-ai/DeepSeek-V4.1-Flash**，把用户上传的 Excel 商业评论
转换为结构化 JSON（情感极性、置信度、评论维度、实体、摘要、是否需人工复核），
前端以饼状图、维度热度、精选评论与明细表展示，并把模型交互数据打印到控制台。

---

## 一、目录结构

```
GJWY/
├── frontend/                     # 前端（原生 HTML / CSS / JavaScript，无框架、无 CDN）
│   ├── comment.html              # 商业评论情感分类页面
│   ├── index.html                # 首页（含各页面入口链接）
│   ├── css/xu_comment.css        # 分类页样式（xu_ 前缀）
│   ├── js/xu_comment.js          # 上传、请求、饼图绘制与结果渲染
│   └── downloads/                # 3 份示例数据（每份 20 条评论）
├── backend/                      # 后端（Node.js + Express）
│   ├── server.js                 # 入口：静态托管、跨域、路由、统一错误处理
│   ├── xu_comment.js             # 业务：Excel 解析 → 提示词 → 校验重试 → 入库
│   ├── xu_llm.js                 # 大模型调用封装（打印发送 / 接收数据）
│   ├── xu_db.js                  # MySQL 连接池
│   ├── xu_env.js                 # .env 配置读取
│   ├── xu_check_key.js           # 大模型凭据自检脚本
│   ├── xu_init_db.js             # 建库建表
│   ├── xu_gen_demo_data.js       # 生成示例 Excel
│   ├── xu_interface.md           # 接口变更记录
│   └── xu_database.md            # 数据库变更与重建记录
├── AGENTS.md                     # 项目开发规则
├── README.md                     # 本文件
└── xuben_prompt.md               # AI 开发指令记录
```

---

## 二、环境要求

| 项目 | 版本 / 说明 |
|---|---|
| Node.js | 24 及以上（内置 `fetch`，无需 axios） |
| 包管理器 | `cnpm`（优先）或 `npm`、`pnpm` |
| MySQL | 8.0，字符集 `utf8mb4` |
| 浏览器 | Chrome / Edge 最新版 |
| 大模型服务 | 硅基流动 SiliconFlow，模型 `deepseek-ai/DeepSeek-V4.1-Flash` |
| 端口 | 后端固定 **8011**，前端由 `express.static` 托管 |

---

## 三、配置项（`backend/.env`）

`backend/.env` 已被 `.gitignore` 排除，需自行创建并按下列变量填写：

| 变量 | 说明 | 示例 |
|---|---|---|
| `PORT` | 服务端口 | `8011` |
| `DB_USER` | MySQL 用户名 | `root` |
| `DB_PASSWORD` | MySQL 密码 | `********` |
| `DB_HOST` | MySQL 主机 | `localhost` |
| `DB_NAME` | 数据库名 | `xu_sentiment` |
| `LLM_BASE_URL` | 大模型 OpenAI 兼容端点 | `https://api.siliconflow.cn/v1` |
| `LLM_MODEL` | 模型名称 | `deepseek-ai/DeepSeek-V4.1-Flash` |
| `LLM_API_KEY` | 平台密钥（仅保存在服务端） | `sk-********` |

API Key 申请地址：<https://cloud.siliconflow.cn/account/ak>。

---

## 四、启动步骤

```bash
# 1. 安装后端依赖
cd backend
cnpm i            # 失败或超时改用 npm i

# 2. 按 xu_database.md 重建数据库（首次运行）
#    或直接执行：node xu_init_db.js 后，按 xu_database.md 第五章补充 ALTER 与测试数据
node xu_init_db.js

# 3. 自检大模型凭据是否可用（可选）
node xu_check_key.js

# 4. 启动服务
node server.js
```

启动后：

- 分类页面：<http://localhost:8011/comment.html>
- 健康检查：<http://localhost:8011/api/health>

---

## 五、功能清单

1. **Excel 上传**：支持 `.xlsx` / `.xls`，单文件 ≤ 5MB，自动识别「评论内容」列，单次最多分析 60 条，超出部分截断并提示。
2. **大模型结构化分类**：调用 `deepseek-ai/DeepSeek-V4.1-Flash`，每条评论输出
   `sentiment / confidence / aspects / entities / summary / need_review / featured` 七个字段。
3. **JSON 解析与字段校验**：逐条校验枚举、类型、取值范围；通过率低于 80% 自动重试一次；两次均失败时返回兜底结果并标记人工复核。
4. **可视化**：Canvas 环形饼图（好评 / 中评 / 差评）、维度热度 Top5 条形图、精选评论卡片、置信度与待复核统计。
5. **数据持久化**：文件记录写入 `xu_comment_file`，分类结果写入 `xu_comment`（含摘要、维度、实体、复核标记）。
6. **可观测性**：后端终端打印发送给大模型的完整请求体与模型返回体；前端控制台打印接口请求与响应数据。

---

## 六、接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 服务与数据库健康检查 |
| POST | `/api/chat` | 通用对话代理（messages 数组） |
| POST | `/api/comment/analyze` | 上传 Excel 并完成情感分类（multipart，字段名 `file`） |

统一响应格式：`{ "code": 0, "msg": "提示信息", "data": {} }`，`code = 0` 为成功。
详细请求 / 响应示例见 `backend/xu_interface.md`。

---

## 七、数据库重建

仅凭 `backend/xu_database.md` 即可在新机器上完整重建数据库：
按文档顺序执行建库建表、字段变更与测试数据 SQL，再修改 `backend/.env` 填写连接信息即可。

---

## 八、测试与验证

```bash
# 正常上传（20 条评论，约 15~40 秒）
curl -X POST -F "file=@frontend/downloads/示例数据1-生鲜电商.xlsx" \
  http://localhost:8011/api/comment/analyze

# 异常：缺少 file 字段
curl -X POST http://localhost:8011/api/comment/analyze

# 异常：非 Excel 文件
curl -X POST -F "file=@README.md" http://localhost:8011/api/comment/analyze
```

已覆盖的测试场景：正常输入、空内容行、超长评论、特殊字符与 HTML 注入、无评论列文件、非 Excel 文件、
缺少文件字段、不存在的接口（404）。测试结论见项目报告「项目测试」章节。

---

## 九、作者

- 姓名：徐奔
- 学号：24001011011
- 课程：高级网页设计 I · LLM 应用设计
