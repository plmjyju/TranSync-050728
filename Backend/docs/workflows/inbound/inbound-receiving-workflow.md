---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# Inbound 入库接收工作流

## 1. 目标

实现航空 / 货代来源货物的标准化入区接收：登记 → 核验 → 上架 / 待处理，确保包裹基础数据与后续拆板、出库、审计链条的起点可信。

## 2. 生命周期 (示意)

created → awaiting_documents → checking → receiving → received → (optional) putaway → completed / exception

exception: 单证缺失 / 数量差异 / 安全拦截。

## 3. 核心实体

| 实体               | 说明                                          |
| ------------------ | --------------------------------------------- |
| InboundOrder       | 入库单 (来源运单号、承运人、预计到达时间 ETA) |
| InboundPackageTemp | 扫描阶段临时包裹数据 (条码 / 重量 / 尺寸)     |
| Package            | 正式包裹记录 (完成接收后写入)                 |
| Pallet             | 原始 PMC 或现场临时拼板                       |
| DocumentRecord     | 单证 (提单、舱单、报关文件)                   |

## 4. 关键校验

| 校验        | 说明                                |
| ----------- | ----------------------------------- |
| 运单唯一性  | awb + tenant 不重复                 |
| 单证完整    | 必须存在至少提单、装箱单 (FTZ 要求) |
| 数量核对    | 输入预报数量 vs 实际扫描数量        |
| 危险品/温控 | attributes 标记决定后续存储策略     |

## 5. 并发与锁

- 同一 awb: `lock:inbound:awb:<awb>` 防止重复创建
- 同一 InboundOrder 接收扫描：`lock:inbound:order:<id>` 避免计数竞争

## 6. 扫描流程

1. 客户端扫描条码
2. 校验未重复 (临时表 + 全局包裹索引)
3. 写入 InboundPackageTemp
4. 实时增量统计 (Redis incr) 用于进度条

Finalize 入库：

- 批量插入 Package (事务) → 生成 inbound ledger (包裹级) → 更新 InboundOrder 状态 received

## 7. 台账写入 (direction=inbound)

unique_key: `in:<pallet_id>:<package_id>:<item_id>`

- item_id 可为 1 (若无拆箱维度)
- prev_hash 取同方向链最后一条

## 8. 审计事件

| 动作       | action                        |
| ---------- | ----------------------------- |
| 创建入库单 | inbound-order-create          |
| 上传单证   | inbound-order-doc-upload      |
| 开始接收   | inbound-order-receiving-start |
| 包裹扫描   | inbound-package-scan          |
| Finalize   | inbound-order-finalize        |
| 异常登记   | inbound-order-exception       |

extra 建议：scanned_count, expected_count, discrepancy_list, awb, documents

## 9. 错误代码 (INBOUND\_\*)

| Code                      | 场景         |
| ------------------------- | ------------ |
| INBOUND_AWB_DUP           | 运单重复     |
| INBOUND_DOC_MISSING       | 单证缺失     |
| INBOUND_PACKAGE_DUP_SCAN  | 重复扫描     |
| INBOUND_FINALIZE_MISMATCH | 数量不匹配   |
| INBOUND_STATUS_INVALID    | 非法状态跳转 |

## 10. 事务策略

- Finalize: 插入 package + 写 ledger + 更新 order 状态一个事务
- 异常状态变更单独事务 + 审计

## 11. 性能优化

- 扫描阶段只写临时表 (轻字段) 减少锁竞争
- Finalize 聚合统计使用 `COUNT(*) FROM InboundPackageTemp WHERE order_id=?`

## 12. 自检清单

1. 是否过滤 tenant_id / warehouse_id? (Y/N)
2. Finalize 是否单事务且写 ledger? (Y/N)
3. 是否记录审计 + 差异? (Y/N)
4. 是否防重复扫描? (Y/N)
5. 是否按指引使用锁? (Y/N)

## 13. 扩展计划

- ASN (预先发货通知) 自动生成 InboundOrder
- 条码纠错 (编辑距离提示)
- 重量体积自动采集 API 集成
