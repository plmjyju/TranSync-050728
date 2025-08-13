# TranSync 颗粒化权限系统实施指南

## 系统概述

TranSync 已成功实施了完整的颗粒化权限管理系统，支持基于角色的访问控制(RBAC)，为不同端口提供细粒度的权限管理。

## 权限架构

### 1. 系统访问权限

- `omp.access` - OMP 系统访问权限
- `warehouse.access` - 仓库系统访问权限
- `agent.access` - 货代系统访问权限
- `wms.access` - WMS 系统访问权限
- `client.access` - 客户端系统访问权限

### 2. 权限模块分类

#### 用户管理权限 (user 模块)

- `user.view` - 查看用户列表
- `user.create` - 创建用户
- `user.edit` - 编辑用户信息
- `user.delete` - 删除用户
- `user.role.assign` - 分配用户角色
- `user.password.reset` - 重置用户密码
- `user.status.change` - 修改用户状态

#### 角色权限管理 (role 模块)

- `role.view` - 查看角色列表
- `role.create` - 创建角色
- `role.edit` - 编辑角色信息
- `role.delete` - 删除角色
- `role.permission.assign` - 分配角色权限
- `permission.view` - 查看权限列表

#### Agent 货代权限 (agent 模块)

**预报单权限**

- `agent.forecast.view.own` - 查看自己的预报单
- `agent.forecast.view.all` - 查看所有预报单
- `agent.forecast.create` - 创建预报单
- `agent.forecast.edit.own` - 编辑自己的预报单
- `agent.forecast.edit.all` - 编辑所有预报单
- `agent.forecast.delete` - 删除预报单
- `agent.forecast.submit` - 提交预报单
- `agent.forecast.cancel` - 取消预报单

**包裹权限**

- `agent.package.view` - 查看包裹
- `agent.package.create` - 添加包裹
- `agent.package.edit` - 编辑包裹
- `agent.package.delete` - 删除包裹
- `agent.package.batch.import` - 批量导入包裹
- `agent.package.batch.export` - 批量导出包裹

**HAWB 权限**

- `agent.hawb.view` - 查看 HAWB
- `agent.hawb.create` - 创建 HAWB
- `agent.hawb.edit` - 编辑 HAWB
- `agent.hawb.delete` - 删除 HAWB
- `agent.hawb.assign` - 分配 HAWB 给包裹

#### 客户端权限 (client 模块)

- `client.dashboard.view` - 查看仪表盘
- `client.forecast.view` - 查看预报单信息
- `client.package.view` - 查看包裹信息
- `client.package.edit` - 编辑包裹信息
- `client.package.track` - 跟踪包裹状态
- `client.statistics.view` - 查看统计信息
- `client.invoice.view` - 查看账单
- `client.invoice.download` - 下载账单

#### 仓库管理权限 (warehouse 模块)

**航空板权限**

- `warehouse.pallet.view` - 查看航空板
- `warehouse.pallet.create` - 创建航空板
- `warehouse.pallet.edit` - 编辑航空板
- `warehouse.pallet.delete` - 删除航空板
- `warehouse.pallet.scan` - 扫描包裹到板
- `warehouse.pallet.inbound` - 航空板入仓
- `warehouse.pallet.unpack` - 拆板操作
- `warehouse.pallet.dispatch` - 航空板出库
- `warehouse.pallet.return` - 航空板归还
- `warehouse.pallet.allocate` - 分配包裹到板子
- `warehouse.pallet.logs` - 查看板操作日志

**提货单权限**

- `warehouse.delivery_order.view` - 查看提货单
- `warehouse.delivery_order.create` - 创建提货单
- `warehouse.delivery_order.edit` - 编辑提货单
- `warehouse.delivery_order.delete` - 删除提货单
- `warehouse.delivery_order.pickup` - 确认提货
- `warehouse.delivery_order.cancel` - 取消提货单
- `warehouse.delivery_order.transport` - 运输管理
- `warehouse.delivery_order.delivery` - 入库完成管理

**库位管理权限**

- `warehouse.location.view` - 查看库位信息
- `warehouse.location.create` - 创建库位
- `warehouse.location.edit` - 编辑库位信息
- `warehouse.location.delete` - 删除库位

#### WMS 系统权限 (wms 模块)

- `wms.dashboard.view` - 查看 WMS 仪表盘
- `wms.forecast.view` - 查看预报单信息
- `wms.inbound.view` - 查看入库信息
- `wms.inbound.create` - 创建入库单
- `wms.inbound.edit` - 编辑入库单
- `wms.inbound.confirm` - 确认入库
- `wms.inventory.view` - 查看库存
- `wms.inventory.adjust` - 调整库存
- `wms.inventory.count` - 库存盘点

#### 报表权限 (report 模块)

- `report.forecast` - 预报单报表
- `report.package` - 包裹报表
- `report.inventory` - 库存报表
- `report.financial` - 财务报表
- `report.operation` - 运营报表
- `report.export` - 导出报表

## 预定义角色

### 1. 超级管理员 (super_admin)

- 拥有系统所有权限
- 特殊标记：permissions = "ALL"

### 2. OMP 运营管理角色

**OMP 运营经理 (omp_manager)**

- 完整的 OMP 系统管理权限
- 用户和客户管理权限
- 所有报表权限
- 系统日志查看权限

**OMP 运营专员 (omp_operator)**

- 基础 OMP 操作权限
- 预报单查看和编辑
- 部分报表权限

### 3. Agent 货代角色

**货代经理 (agent_manager)**

- 可查看和操作所有货代数据
- 完整的预报单、包裹、HAWB 管理权限
- 批量操作权限

**货代操作员 (agent_operator)**

- 只能操作自己的数据
- 基础的预报单和包裹操作权限

### 4. 仓库管理角色

**仓库经理 (warehouse_manager)**

- 完整的仓库管理权限
- 航空板、提货单、出库管理
- 库存管理权限

**仓库操作员 (warehouse_operator)**

- 基础仓库操作权限
- 扫描、入库、出库确认等

### 5. WMS 角色

**WMS 管理员 (wms_manager)**

- 完整的 WMS 系统权限
- 入库、出库、库存管理

**WMS 操作员 (wms_operator)**

- 基础 WMS 操作权限

### 6. 客户角色

**VIP 客户 (client_vip)**

- 完整的客户端权限，包括账单下载

**普通客户 (client_standard)**

- 基础客户端权限

### 7. 专业角色

**财务经理 (finance_manager)**

- 财务报表和客户账单权限

**客服专员 (customer_service)**

- 跨系统查看权限，用于客户服务

## 权限中间件

### 1. 基础权限检查

```javascript
checkPermission("permission.name");
```

### 2. 多重权限检查

```javascript
checkMultiplePermissions(["perm1", "perm2"]); // 需要同时拥有所有权限
```

### 3. 任一权限检查

```javascript
checkAnyPermission(["perm1", "perm2"]); // 只需要拥有其中一个权限
```

## API 端点

### 权限管理 API (/api/omp/permissions)

#### 权限相关

- `GET /permissions` - 获取权限列表
- `GET /permissions/modules` - 获取模块列表

#### 角色相关

- `GET /roles` - 获取角色列表
- `GET /roles/:id` - 获取角色详情
- `POST /roles` - 创建角色
- `PUT /roles/:id` - 更新角色
- `DELETE /roles/:id` - 删除角色

#### 用户角色管理

- `POST /users/:userId/role` - 分配用户角色
- `GET /users/:userId/permissions` - 获取用户权限

#### 系统管理

- `POST /initialize` - 重新初始化权限系统

## 实施状态

### ✅ 已完成

1. **权限种子数据** - 154 个细粒度权限定义
2. **角色种子数据** - 12 个预定义角色
3. **权限中间件** - 支持单个、多个、任一权限检查
4. **权限管理 API** - 完整的 CRUD 操作
5. **端口权限控制** - 所有端口启用访问权限检查
6. **路由权限** - 主要路由添加了权限检查

### 🔧 需要配置

1. **数据库初始化** - 运行权限初始化脚本
2. **用户角色分配** - 为现有用户分配适当角色
3. **客户端权限** - 更新客户端权限控制逻辑

## 使用指南

### 1. 初始化权限系统

```bash
npm run seed:permissions
```

### 2. 在路由中使用权限

```javascript
import { checkPermission } from "../../middlewares/checkPermission.js";

router.get(
  "/data",
  authenticate,
  checkPermission("module.action.view"),
  handler
);
```

### 3. 分配用户角色

```javascript
POST /api/omp/permissions/users/:userId/role
{
  "role_id": 1
}
```

### 4. 创建自定义角色

```javascript
POST /api/omp/permissions/roles
{
  "name": "custom_role",
  "display_name": "自定义角色",
  "description": "角色描述",
  "permission_ids": [1, 2, 3]
}
```

## 安全特性

1. **最小权限原则** - 用户只获得完成工作所需的最小权限
2. **角色继承** - 通过角色组合实现权限继承
3. **权限审计** - 所有权限操作可追踪
4. **动态权限** - 支持运行时权限更新
5. **客户端隔离** - 客户端用户只能访问自己的数据

## 下一步计划

1. **权限缓存** - 实现权限结果缓存提升性能
2. **细粒度数据权限** - 实现数据级别的权限控制
3. **权限审计日志** - 记录所有权限相关操作
4. **前端权限控制** - 实现前端 UI 权限控制
5. **批量权限操作** - 支持批量用户权限分配
