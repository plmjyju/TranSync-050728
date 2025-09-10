---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 权限与角色系统

## 1. 设计目标

- 细粒度操作控制 (按钮级 / 流程节点)
- 跨模块复用（OMP/WMS/Agent/Client）
- 快速初始化与增量扩展

## 2. 模型结构

| 模型           | 关键字段                   | 说明                            |
| -------------- | -------------------------- | ------------------------------- |
| Permission     | name, display_name, module | 原子权限定义                    |
| Role           | name, display_name         | 权限集合载体                    |
| RolePermission | role_id, permission_id     | 关联表                          |
| User           | role_id                    | 用户绑定角色 (token 时展开权限) |

## 3. 初始化机制

脚本：`seed/initPermissionsAndRoles.js` 读取 `seed/permissions.js` 批量 upsert。

新增权限步骤：

1. 编辑 seed/permissions.js 添加对象
2. `npm run seed:permissions`
3. 在管理端 UI 分配角色 (或脚本自动更新)

## 4. 权限命名规范

`<域>.<资源>[.<动作>]`
示例：

- warehouse.split_order.finalize
- agent.package.create
- client.package.track

## 5. 使用模式

后端：`checkPermission("warehouse.split_order.scan")`
前端：基于 token.permissions 控制渲染（避免信任前端）

## 6. 角色策略

- 角色最小化：倾向任务型 (split_operator / inbound_operator)
- 管理员区分：系统运营 (omp_admin) vs 仓库主管 (wms_lead)

## 7. 变更与审计

- 新增权限：审计 action = permission-seed-change
- 角色修改：在角色路由写入 SystemActivity + 审计 (规划整合)

## 8. 性能优化

- 登录时把角色权限展平到 token 减少运行期 JOIN
- 批量加载权限时 order by module + name 便于前端分组缓存

## 9. 常见问题与防御

| 问题               | 预防                                       |
| ------------------ | ------------------------------------------ |
| 权限名拼写不一致   | 统一 seed 定义，代码引用常量（可后续生成） |
| 直接 DB 更新角色   | 强制通过脚本或服务端 API 以写审计          |
| token 过期权限失效 | 及时刷新 (计划 refresh token)              |

## 10. 自检清单

1. 新增路由是否添加权限检查? (Y/N)
2. 是否使用 seed 更新而非手动插入? (Y/N)
3. 权限命名是否符合规范? (Y/N)
4. 是否避免在代码硬编码用户 ID 的特权判断? (Y/N)
