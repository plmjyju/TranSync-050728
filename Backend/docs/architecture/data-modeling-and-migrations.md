---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 数据建模与迁移策略

## 1. 目标

在多租户、可审计、高并发场景下，保障模型演进的向前兼容与最小停机。

## 2. 基本约定

| 项     | 约定                                    |
| ------ | --------------------------------------- |
| 命名   | 表 snake_case, 模型 PascalCase          |
| 时间   | 统一使用 UTC DATETIME / TIMESTAMP       |
| 软删除 | 仅在需要时增加 deleted_at (默认不启用)  |
| 多租户 | 必含 tenant_id, warehouse_id (渐进补齐) |

## 3. 迁移流程

1. 评估变更 (字段/索引/枚举)
2. 编写向前兼容迁移脚本 (add column nullable)
3. 部署迁移 → 验证 → 部署依赖代码
4. 回填数据 (若需要) 单独脚本
5. 移除兼容逻辑 (第二阶段清理)

## 4. ENUM 扩展

- 仅新增，不重命名/删除 (需要新字段 + 数据迁移 + 替换)
- 旧值废弃：增加状态映射层

## 5. 索引策略

| 场景                            | 索引                                          |
| ------------------------------- | --------------------------------------------- |
| 审计查询 (entityType, entityId) | BTREE (entity_type, entity_id, created_at)    |
| Ledger 链                       | (tenant_id, warehouse_id, direction, id) 覆盖 |
| 包裹查询                        | (pallet_id), (operation_requirement_id)       |
| 拆板扫描去重                    | unique(package_id, active_split_flag) (规划)  |

## 6. 大表变更策略

- 先新增临时列 new_col nullable
- 双写 (代码写 old_col & new_col)
- 数据回填批处理 (分批 LIMIT + ORDER BY PK)
- 切换读到 new_col
- 移除 old_col / 旧代码

## 7. 回滚策略

- 向前兼容迁移：可空新增无需回滚
- 破坏性迁移：在执行前导出结构 + 数据快照 (mysqldump)

## 8. 数据一致性检查

- 差异对账任务：比对冗余字段 (pallet.box_count vs COUNT(packages))
- Ledger hash 夜间重算

## 9. 多租户隔离

- 新增字段时立即创建 (tenant_id, warehouse_id) 组合索引
- 查询默认 where 过滤；防忘记：可引入 Sequelize defaultScope

## 10. 版本与追踪

- 迁移文件命名：`YYYYMMDDHHMM__short_description.js`
- 记录执行 hash + 时间 (SequelizeMeta)

## 11. 常见陷阱

| 问题          | 规避                           |
| ------------- | ------------------------------ |
| 直接删除列    | 使用弃用周期，先停止引用       |
| ENUM 值重命名 | 新增新值 + 迁移数据 + 清理旧值 |
| 长事务锁表    | 分批更新 / 在线 DDL            |
| 缺失租户索引  | 添加复合索引提升过滤效率       |

## 12. 自检清单

1. 迁移是否向前兼容? (Y/N)
2. 是否包含租户/仓库索引? (Y/N)
3. 是否有回填 / 双写计划? (Y/N)
4. 是否避免长事务? (Y/N)
5. 是否记录迁移元数据? (Y/N)

## 13. 扩展计划

- 自动生成差异报告 (比对模型定义 vs DB)
- 数据迁移工具链 (在线批迁移调度)
- 多区域 schema 版本同步监控
