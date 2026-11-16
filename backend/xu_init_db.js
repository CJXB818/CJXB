/*
 * 姓名：【徐奔】 | 学号：【24001011011】 |
 * 时间：2026-11-16 | 大模型：DeepSeek-V4.1-Flash
 *
 * 数据库初始化脚本：
 * 1. 创建数据库 xu_sentiment 与两张表
 * 2. 插入测试数据（每张表不少于 8 条）
 * 3. 执行后把 SQL 追加到 backend/xu_database.md（仅首次）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

/* ---------------- 读取 .env ---------------- */
function xu_loadEnv(filePath) {
    if (!fs.existsSync(filePath)) return;
    fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach(function (line) {
        const xu_line = line.trim();
        if (!xu_line || xu_line.startsWith('#')) return;
        const xu_index = xu_line.indexOf('=');
        if (xu_index === -1) return;
        const xu_key = xu_line.slice(0, xu_index).trim();
        let xu_value = xu_line.slice(xu_index + 1).trim();
        if (
            (xu_value.startsWith('"') && xu_value.endsWith('"')) ||
            (xu_value.startsWith("'") && xu_value.endsWith("'"))
        ) {
            xu_value = xu_value.slice(1, -1);
        }
        if (!process.env[xu_key]) process.env[xu_key] = xu_value;
    });
}

xu_loadEnv(path.join(__dirname, '.env'));

const xu_dbName = process.env.DB_NAME || 'xu_sentiment';

/* ---------------- SQL 定义 ---------------- */
const XU_SQL = [
`-- 1. 创建数据库
CREATE DATABASE IF NOT EXISTS \`${xu_dbName}\`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;`,

`-- 2. 切换数据库
USE \`${xu_dbName}\`;`,

`-- 3. 评论文件表
CREATE TABLE IF NOT EXISTS xu_comment_file (
  xu_id         INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  xu_file_name  VARCHAR(255) NOT NULL COMMENT '上传的文件名',
  xu_total      INT NOT NULL DEFAULT 0 COMMENT '评论条数',
  xu_source     VARCHAR(20) NOT NULL DEFAULT 'upload' COMMENT '来源：upload 上传 / demo 示例',
  xu_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  KEY xu_idx_created_at (xu_created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商业评论文件记录表';`,

`-- 4. 评论与情感分类结果表
CREATE TABLE IF NOT EXISTS xu_comment (
  xu_id         INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  xu_file_id    INT NOT NULL COMMENT '所属文件',
  xu_no         INT NOT NULL COMMENT '文件内序号',
  xu_content    VARCHAR(500) NOT NULL COMMENT '评论内容',
  xu_sentiment  VARCHAR(10) DEFAULT NULL COMMENT '情感：好评 / 中评 / 差评',
  xu_score      DECIMAL(3,2) DEFAULT NULL COMMENT '情感得分 -1.00 ~ 1.00',
  xu_reason     VARCHAR(255) DEFAULT NULL COMMENT '分类理由',
  xu_featured   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否精选：1 是 0 否',
  xu_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  KEY xu_idx_file_id (xu_file_id),
  CONSTRAINT xu_fk_comment_file FOREIGN KEY (xu_file_id)
    REFERENCES xu_comment_file (xu_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商业评论情感分类结果表';`,

`-- 5. 文件记录测试数据（8 条）
INSERT INTO xu_comment_file (xu_file_name, xu_total, xu_source) VALUES
('示例数据1-生鲜电商.xlsx', 20, 'demo'),
('示例数据2-数码家电.xlsx', 20, 'demo'),
('示例数据3-餐饮外卖.xlsx', 20, 'demo'),
('双11大促评论.xlsx', 20, 'upload'),
('门店服务评价.xlsx', 18, 'upload'),
('物流满意度回访.xlsx', 20, 'upload'),
('新品试用反馈.xlsx', 15, 'upload'),
('售后工单回访.xlsx', 22, 'upload');`,

`-- 6. 评论测试数据（16 条，覆盖好评 / 中评 / 差评）
INSERT INTO xu_comment (xu_file_id, xu_no, xu_content, xu_sentiment, xu_score, xu_reason, xu_featured) VALUES
(1, 1, '包装很用心，冰袋还没化，车厘子又大又甜，下次还来买', '好评', 0.90, '明确肯定口感与包装，复购意愿强', 1),
(1, 2, '物流超快，早上下单晚上就送到，虾非常新鲜', '好评', 0.85, '正面评价物流时效与新鲜度', 1),
(1, 3, '客服态度好，有两颗坏果立刻补发，体验很棒', '好评', 0.90, '售后响应及时，服务体验正向', 1),
(1, 4, '味道还行，就是价格比楼下超市贵一点', '中评', 0.10, '整体认可但存在价格异议', 0),
(1, 5, '东西没问题，但是配送比承诺晚了一天', '中评', -0.10, '商品无误，配送时效不符预期', 1),
(1, 6, '份量比图片上少一些，其他还可以', '中评', 0.00, '分量与描述有落差，其余无异议', 0),
(1, 7, '收到时已经烂了一半，申请退款还要等审核，很失望', '差评', -0.90, '商品质量缺陷叠加退款流程繁琐', 1),
(1, 8, '客服一直不回复，问题拖了三天都没解决', '差评', -0.85, '售后失联，问题长期未解决', 1),
(4, 1, '大促价格真香，比平时便宜了四十块，囤了一箱', '好评', 0.88, '价格优势明显，重复购买', 1),
(4, 2, '凑单规则太复杂，算了半天还是没搞明白', '差评', -0.55, '活动规则复杂，影响下单体验', 1),
(4, 3, '发货速度快，包装完好，没有任何磕碰', '好评', 0.80, '物流与包装均符合预期', 0),
(4, 4, '优惠券不能叠加使用，和宣传的不一样', '差评', -0.65, '促销规则与宣传不符', 1),
(4, 5, '整体还不错，就是赠品比上次少了一个', '中评', 0.05, '总体满意，赠品略有减少', 0),
(4, 6, '客服回复很快，帮我改了收货地址，感谢', '好评', 0.82, '客服响应及时，解决具体问题', 0),
(4, 7, '抢购页面一直卡，付了三次才成功', '差评', -0.70, '系统卡顿导致重复支付', 1),
(4, 8, '价格合适，质量也就一般，属于正常发挥', '中评', 0.00, '价格与质量基本匹配，无明显情绪', 0);`
];

/* ---------------- 执行 ---------------- */
(async function () {
    const xu_conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true
    });

    for (const xu_sql of XU_SQL) {
        await xu_conn.query(xu_sql);
        console.log('[OK] ' + xu_sql.split('\n')[0]);
    }

    await xu_conn.changeUser({ database: xu_dbName });

    const [xu_files] = await xu_conn.query('SELECT COUNT(*) AS c FROM xu_comment_file');
    const [xu_comments] = await xu_conn.query('SELECT COUNT(*) AS c FROM xu_comment');
    console.log('xu_comment_file 行数 = ' + xu_files[0].c);
    console.log('xu_comment 行数 = ' + xu_comments[0].c);

    await xu_conn.end();

    /* 写入 xu_database.md（仅首次） */
    const xu_mdPath = path.join(__dirname, 'xu_database.md');
    const xu_marker = '<!-- INIT:' + xu_dbName + ' -->';

    if (!fs.existsSync(xu_mdPath) || !fs.readFileSync(xu_mdPath, 'utf8').includes(xu_marker)) {
        const xu_header = [
            '',
            '## ' + new Date().toLocaleString('zh-CN') + ' · 初始化数据库',
            '',
            xu_marker,
            '',
            '> 在 MySQL 中按顺序执行以下语句即可完整重建数据库（默认 root 账号，密码见 backend/.env）。',
            '',
            '```sql',
            XU_SQL.join('\n\n'),
            '```',
            ''
        ].join('\n');

        fs.appendFileSync(xu_mdPath, xu_header, 'utf8');
        console.log('已追加 SQL 到 backend/xu_database.md');
    } else {
        console.log('xu_database.md 已存在初始化记录，跳过追加');
    }
})().catch(function (xu_err) {
    console.error('初始化失败：', xu_err.message);
    process.exit(1);
});
