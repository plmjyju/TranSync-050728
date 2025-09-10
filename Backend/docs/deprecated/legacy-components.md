---
status: deprecated
last-reviewed: 2025-08-19
owner: backend
---

# 已废弃组件 (Legacy Components)

## 1. 目的

列出已移除或计划清理的旧实现，避免误用与重复维护。

## 2. 列表

| 组件                                       | 状态   | 替代                            |
| ------------------------------------------ | ------ | ------------------------------- |
| middleware/auth.js                         | 已移除 | middlewares/authenticate.js     |
| 多份权限种子脚本 (冗余)                    | 已归档 | seed/initPermissionsAndRoles.js |
| 临时拆板脚本 test_split_finalize.js        | 已归档 | 标准 API + 集成测试             |
| 手工 ledger 写脚本 ledger_manual_insert.js | 已归档 | writeFtzInternalMoveLedger API  |

## 3. 清理策略

- 归档目录 `_backup_removed_<date>` 保留 30 天后移至冷存储
- 每季度审查 deprecated 列表，关闭残留引用

## 4. 审计

- 删除生产关键组件需审计 action=component-deprecate extra: { name, replacement }

## 5. 后续计划

- 清除所有直连 process.env 的历史片段 (扫描脚本)
- 移除未被引用的旧 ENUM 值 (循序替换)
