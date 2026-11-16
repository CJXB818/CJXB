# xu_database.md -- 数据库变更与重建记录

> 姓名：【徐奔】 | 学号：【24001011011】
> 本文件按执行顺序记录所有建表、改表与数据插入语句，仅凭本文件即可在新机器上重建数据库。
> 数据库连接凭据见 backend/.env，不在此文件中出现。

## 2026/11/16 15:38:56 · 初始化数据库

<!-- INIT:xu_sentiment -->

> 在 MySQL 中按顺序执行以下语句即可完整重建数据库（默认 root 账号，密码见 backend/.env）。

```sql
-- 1. 创建数据库
CREATE DATABASE IF NOT EXISTS `xu_sentiment`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

-- 2. 切换数据库
USE `xu_sentiment`;

-- 3. 评论文件表
CREATE TABLE IF NOT EXISTS xu_comment_file (
  xu_id         INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
  xu_file_name  VARCHAR(255) NOT NULL COMMENT '上传的文件名',
  xu_total      INT NOT NULL DEFAULT 0 COMMENT '评论条数',
  xu_source     VARCHAR(20) NOT NULL DEFAULT 'upload' COMMENT '来源：upload 上传 / demo 示例',
  xu_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  KEY xu_idx_created_at (xu_created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商业评论文件记录表';

-- 4. 评论与情感分类结果表
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商业评论情感分类结果表';

-- 5. 文件记录测试数据（8 条）
INSERT INTO xu_comment_file (xu_file_name, xu_total, xu_source) VALUES
('示例数据1-生鲜电商.xlsx', 20, 'demo'),
('示例数据2-数码家电.xlsx', 20, 'demo'),
('示例数据3-餐饮外卖.xlsx', 20, 'demo'),
('双11大促评论.xlsx', 20, 'upload'),
('门店服务评价.xlsx', 18, 'upload'),
('物流满意度回访.xlsx', 20, 'upload'),
('新品试用反馈.xlsx', 15, 'upload'),
('售后工单回访.xlsx', 22, 'upload');

-- 6. 评论测试数据（16 条，覆盖好评 / 中评 / 差评）
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
(4, 8, '价格合适，质量也就一般，属于正常发挥', '中评', 0.00, '价格与质量基本匹配，无明显情绪', 0);
```

---

## 2026/11/16 16:14:10 · xu_comment 表新增结构化输出字段

> 背景：评论情感分类由「情感 + 得分 + 理由」升级为完整 JSON 结构化输出，
> 需要持久化置信度、评论维度、实体、摘要与人工复核标记。

```sql
-- 1. 新增 5 个字段（已有数据保持原值，后续由分析流程写入）
ALTER TABLE xu_comment
  ADD COLUMN xu_summary     VARCHAR(255) DEFAULT NULL COMMENT '一句话摘要',
  ADD COLUMN xu_confidence  DECIMAL(3,2) DEFAULT NULL COMMENT '模型置信度 0.00~1.00',
  ADD COLUMN xu_aspects     VARCHAR(120) DEFAULT NULL COMMENT '评论维度 JSON 数组',
  ADD COLUMN xu_entities    VARCHAR(255) DEFAULT NULL COMMENT '实体 JSON 数组',
  ADD COLUMN xu_need_review TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否需人工复核：1 是 0 否';
```

```sql
-- 2. 历史 16 条评论的结构化字段回填（与初始测试数据一一对应）
UPDATE xu_comment SET xu_summary='包装保鲜到位，口感甜，复购意愿强', xu_confidence=0.90,
  xu_aspects='["包装","口味"]', xu_entities='[{"name":"车厘子","type":"product"},{"name":"冰袋","type":"logistics"}]', xu_need_review=0
  WHERE xu_file_id=1 AND xu_no=1;
UPDATE xu_comment SET xu_summary='物流极快，虾很新鲜', xu_confidence=0.85,
  xu_aspects='["物流"]', xu_entities='[{"name":"虾","type":"product"}]', xu_need_review=0
  WHERE xu_file_id=1 AND xu_no=2;
UPDATE xu_comment SET xu_summary='坏果补发及时，服务体验好', xu_confidence=0.88,
  xu_aspects='["客服","售后"]', xu_entities='[{"name":"客服","type":"service"}]', xu_need_review=0
  WHERE xu_file_id=1 AND xu_no=3;
UPDATE xu_comment SET xu_summary='味道认可，价格略高于超市', xu_confidence=0.62,
  xu_aspects='["价格"]', xu_entities='[{"name":"楼下超市","type":"brand"}]', xu_need_review=0
  WHERE xu_file_id=1 AND xu_no=4;
UPDATE xu_comment SET xu_summary='商品无误，配送晚了一天', xu_confidence=0.72,
  xu_aspects='["物流"]', xu_entities='[{"name":"配送","type":"logistics"}]', xu_need_review=0
  WHERE xu_file_id=1 AND xu_no=5;
UPDATE xu_comment SET xu_summary='分量与图片有落差，其余无异议', xu_confidence=0.58,
  xu_aspects='["质量"]', xu_entities='[]', xu_need_review=1
  WHERE xu_file_id=1 AND xu_no=6;
UPDATE xu_comment SET xu_summary='到货腐烂，退款审核缓慢', xu_confidence=0.90,
  xu_aspects='["质量","售后"]', xu_entities='[{"name":"退款","type":"service"}]', xu_need_review=0
  WHERE xu_file_id=1 AND xu_no=7;
UPDATE xu_comment SET xu_summary='客服失联，问题三天未解决', xu_confidence=0.88,
  xu_aspects='["客服","售后"]', xu_entities='[{"name":"客服","type":"service"}]', xu_need_review=0
  WHERE xu_file_id=1 AND xu_no=8;
UPDATE xu_comment SET xu_summary='大促价格优惠，重复购买', xu_confidence=0.88,
  xu_aspects='["价格"]', xu_entities='[]', xu_need_review=0
  WHERE xu_file_id=4 AND xu_no=1;
UPDATE xu_comment SET xu_summary='凑单规则复杂，影响下单', xu_confidence=0.78,
  xu_aspects='["价格","活动"]', xu_entities='[]', xu_need_review=0
  WHERE xu_file_id=4 AND xu_no=2;
UPDATE xu_comment SET xu_summary='发货快，包装完好无磕碰', xu_confidence=0.80,
  xu_aspects='["物流","包装"]', xu_entities='[{"name":"快递","type":"logistics"}]', xu_need_review=0
  WHERE xu_file_id=4 AND xu_no=3;
UPDATE xu_comment SET xu_summary='优惠券不可叠加，与宣传不符', xu_confidence=0.82,
  xu_aspects='["价格","活动"]', xu_entities='[{"name":"优惠券","type":"service"}]', xu_need_review=0
  WHERE xu_file_id=4 AND xu_no=4;
UPDATE xu_comment SET xu_summary='整体满意，赠品比上次少', xu_confidence=0.56,
  xu_aspects='["活动"]', xu_entities='[{"name":"赠品","type":"product"}]', xu_need_review=1
  WHERE xu_file_id=4 AND xu_no=5;
UPDATE xu_comment SET xu_summary='客服快速协助修改地址', xu_confidence=0.84,
  xu_aspects='["客服"]', xu_entities='[{"name":"客服","type":"service"}]', xu_need_review=0
  WHERE xu_file_id=4 AND xu_no=6;
UPDATE xu_comment SET xu_summary='页面卡顿导致重复支付', xu_confidence=0.86,
  xu_aspects='["功能","支付"]', xu_entities='[]', xu_need_review=0
  WHERE xu_file_id=4 AND xu_no=7;
UPDATE xu_comment SET xu_summary='价格合适，质量一般', xu_confidence=0.60,
  xu_aspects='["价格","质量"]', xu_entities='[]', xu_need_review=0
  WHERE xu_file_id=4 AND xu_no=8;
```

```sql
-- 3. 校验：查看新增字段的落库情况
SELECT xu_id, xu_sentiment, xu_confidence, xu_summary, xu_aspects, xu_entities, xu_need_review
FROM xu_comment
ORDER BY xu_id
LIMIT 16;
```
