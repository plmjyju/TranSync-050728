---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# Operation Requirement (操作需求) 管理

## 1. 目标

标准化入库 / 拆板 / 出库等流程对包裹的结构及数量预期，用作拆板分配与差异分析的基准配置。

## 2. 核心字段

| 字段                     | 说明                              |
| ------------------------ | --------------------------------- |
| id                       | 主键                              |
| tenant_id / warehouse_id | 租户/仓库隔离                     |
| code                     | 需求编码 (唯一)                   |
| name                     | 描述名称                          |
| expected_package_count   | 期望包裹数量 (可为 null 表示动态) |
| attributes (JSON)        | 自定义属性 (温控/危险品等)        |
| active                   | 是否启用                          |

## 3. 生命周期

created → active → (deprecated) → archived

- deprecated: 不可分配新单，但历史保留
- archived: 物理下线 (可选迁移/备份)

## 4. 与 Split 协同

- 创建 SplitOrder 时引用 operation_requirement_id
- 动态期望：若 expected_package_count=null，在 VERIFY START 阶段用实际扫描数写回到 `SplitOrderRequirementStat` (不修改原模板)

## 5. 事务与审计

- 创建/更新/状态变更写审计: operation-requirement-(create|update|deprecate|archive)
- 批量启停用使用单事务 + 批量审计 (可聚合 extra.list=[ids])

## 6. 权限 (示例)

| Code                  |
| --------------------- |
| requirement.create    |
| requirement.update    |
| requirement.deprecate |
| requirement.activate  |

## 7. 错误代码 (REQUIREMENT\_\*)

| Code                      | 场景           |
| ------------------------- | -------------- |
| REQUIREMENT_NOT_FOUND     | 不存在         |
| REQUIREMENT_CODE_DUP      | code 重复      |
| REQUIREMENT_INACTIVE      | 被禁用无法引用 |
| REQUIREMENT_INVALID_STATE | 非法状态迁移   |

## 8. 数据校验

- code 统一大写字母+下划线 `[A-Z0-9_]+`
- 更新时禁止修改 code (除非设计迁移工具)

## 9. 查询优化

- 常用列表加 Redis 缓存: key=requirements:tenant:<tenant_id>:warehouse:<wid>
- 失效策略：单条更新后直接删除对应缓存 key

## 10. 自检清单

1. 是否过滤 tenant/warehouse? (Y/N)
2. 是否写审计? (Y/N)
3. 缓存是否失效处理? (Y/N)
4. 状态迁移是否合法? (Y/N)
5. 动态期望是否在 VERIFY START 只读模板? (Y/N)

## 11. 扩展计划

- 多级层次 (父子 requirement)
- 版本化 (version 字段，支持变更追踪)
- 条件规则引擎 (attributes 匹配拆板策略)
