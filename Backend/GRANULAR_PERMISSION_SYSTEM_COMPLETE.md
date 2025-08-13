# TranSync 颗粒化权限系统完整文档

## 🎯 系统概述

TranSync 已实现完整的颗粒化权限管理系统，支持：

- **133 个细粒度权限**：涵盖所有业务模块和操作
- **14 个预定义角色**：从超级管理员到普通客户的完整角色体系
- **5 个系统端口**：OMP、Warehouse、Agent、WMS、Client
- **多级权限控制**：系统访问权限 + 功能模块权限 + 操作级权限

## 📊 权限统计信息

### 权限分布

- **系统访问权限**: 5 个 (每个端口 1 个)
- **用户管理权限**: 7 个 (查看、创建、编辑、删除、角色分配、密码重置、状态修改)
- **角色管理权限**: 5 个 (查看、创建、编辑、删除、权限分配)
- **客户管理权限**: 5 个 (查看、创建、编辑、删除、状态修改)
- **Agent 权限**: 13 个 (预报单、包裹、HAWB 管理)
- **Client 权限**: 8 个 (仪表盘、预报单、包裹、统计、账单)
- **OMP 权限**: 12 个 (运营管理、统计、设置、操作需求)
- **Warehouse 权限**: 28 个 (航空板、提货单、出库、位置管理)
- **WMS 权限**: 9 个 (预报单、入库、库存管理)
- **基础业务权限**: 28 个 (入库、出库、库存、报表、日志)

### 角色统计

- **管理员角色**: 3 个 (超级管理员、OMP 管理员、仓库管理员等)
- **操作员角色**: 6 个 (各系统的操作员)
- **业务角色**: 3 个 (财务、客服、VIP 客户等)
- **客户角色**: 2 个 (VIP 客户、普通客户)

## 🏗️ 权限架构

### 三级权限控制

#### 1. 系统访问级 (System Access Level)

```javascript
// 在 createClientAppRouter.js 中实现
app.use(prefix, authenticate, checkPermission(`${clientType}.access`), router);
```

**访问权限列表:**

- `omp.access` - OMP 系统访问权限
- `warehouse.access` - 仓库系统访问权限
- `agent.access` - 货代系统访问权限
- `wms.access` - WMS 系统访问权限
- `client.access` - 客户端系统访问权限

#### 2. 模块功能级 (Module Function Level)

```javascript
// 在具体路由中实现
router.get("/forecasts", authenticate, checkPermission("omp.forecast.view"), ...)
```

#### 3. 操作细粒级 (Operation Granular Level)

```javascript
// 细分到具体操作
checkPermission("warehouse.pallet.scan"); // 扫描操作
checkPermission("agent.forecast.edit.own"); // 只能编辑自己的
checkPermission("omp.forecast.edit.all"); // 可以编辑所有的
```

## 👥 角色体系详解

### 🔴 管理员级角色

#### 1. 超级管理员 (super_admin)

- **描述**: 系统最高权限用户
- **权限范围**: 所有 133 个权限
- **适用对象**: 系统开发团队、CTO 级别

#### 2. OMP 运营经理 (omp_manager)

- **描述**: 运营管理平台管理员
- **核心权限**:
  - 全局预报单管理
  - 用户和角色管理
  - 操作需求配置
  - 运营数据统计
- **权限数量**: 25 个

#### 3. 仓库经理 (warehouse_manager)

- **描述**: 仓库系统管理员
- **核心权限**:
  - 完整的航空板管理
  - 提货单全流程管理
  - 库位和库存管理
  - 出库确认权限
- **权限数量**: 37 个

### 🟡 操作员级角色

#### 4. OMP 运营专员 (omp_operator)

- **描述**: 日常运营操作人员
- **权限限制**: 无用户管理和系统配置权限
- **权限数量**: 11 个

#### 5. 仓库操作员 (warehouse_operator)

- **描述**: 仓库日常操作人员
- **权限限制**: 无创建/删除权限，主要执行扫描、入库等操作
- **权限数量**: 16 个

#### 6. 货代经理/操作员 (agent_manager/agent_operator)

- **区别**: 经理可管理所有预报单，操作员只能管理自己的
- **核心功能**: 预报单创建、包裹管理、HAWB 分配

#### 7. WMS 管理员/操作员 (wms_manager/wms_operator)

- **区别**: 管理员有库存调整权限，操作员只有查看和基础操作权限

### 🟢 业务支持角色

#### 8. 客户服务 (customer_service)

- **描述**: 客户服务和支持人员
- **跨系统权限**: 可查看 OMP、Warehouse 数据为客户提供服务
- **权限特点**: 只读权限为主，可编辑客户信息

#### 9. 财务经理 (finance_manager)

- **描述**: 财务和结算人员
- **核心权限**: 账单查看、财务报表、客户管理

### 🔵 客户角色

#### 10. VIP 客户 (client_vip)

- **额外权限**: 包裹编辑、账单下载

#### 11. 普通客户 (client_standard)

- **基础权限**: 查看预报单、包裹跟踪、基础统计

## 🛠️ 权限实现机制

### 客户端权限处理

```javascript
// 客户端用户使用预定义权限，无需数据库查询
if (user.userType === "client") {
  const clientPermissions = [
    "client.access",
    "client.forecast.view",
    "client.package.view",
    "client.packages.edit",
    "client.dashboard.view",
    "client.statistics.view",
  ];
  return clientPermissions.includes(permissionName);
}
```

### 系统用户权限处理

```javascript
// 系统用户通过角色-权限表查询
const role = await Role.findByPk(user.role_id, {
  include: [{ model: Permission, as: "permissions" }],
});
const hasPermission = role.permissions.some((p) => p.name === permissionName);
```

## 🔧 权限管理 API

### 权限查询

- `GET /api/omp/permissions/permissions` - 获取所有权限列表
- `GET /api/omp/permissions/permissions?module=omp` - 按模块筛选权限

### 角色管理

- `GET /api/omp/permissions/roles` - 获取所有角色
- `GET /api/omp/permissions/roles/:id` - 获取角色详情
- `POST /api/omp/permissions/roles` - 创建新角色
- `PUT /api/omp/permissions/roles/:id` - 更新角色
- `DELETE /api/omp/permissions/roles/:id` - 删除角色

### 用户角色分配

- `POST /api/omp/permissions/users/:userId/role` - 分配用户角色
- `GET /api/omp/permissions/users/:userId/permissions` - 查看用户权限

## 📝 使用示例

### 1. 在路由中应用权限

```javascript
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";

// 系统访问权限在端口级别自动应用
// 功能权限在路由级别手动应用
router.get(
  "/sensitive-data",
  authenticate, // 身份验证
  checkPermission("module.action.view"), // 权限检查
  async (req, res) => {
    // 业务逻辑
  }
);
```

### 2. 权限初始化

```bash
# 运行权限初始化脚本
cd Backend
node scripts/initPermissions.mjs
```

### 3. 为用户分配角色

```javascript
// 通过API分配角色
POST /api/omp/permissions/users/123/role
{
  "roleId": 2  // warehouse_manager
}
```

## 🚀 部署和维护

### 初始化步骤

1. 运行 `node scripts/initPermissions.mjs` 初始化权限和角色
2. 创建系统管理员用户并分配 `super_admin` 角色
3. 根据实际需求为用户分配合适的角色

### 扩展权限

1. 在 `seed/permissions.js` 中添加新权限
2. 在 `seed/roles.js` 中更新角色权限分配
3. 重新运行初始化脚本

### 监控和审计

- 所有权限检查都有详细的日志记录
- 权限拒绝操作会记录用户信息和请求的权限
- 支持导出用户权限报表进行审计

## 🔒 安全特性

1. **最小权限原则**: 每个角色只分配必需的权限
2. **角色隔离**: 不同业务角色之间权限互不干扰
3. **操作审计**: 所有权限操作都有日志记录
4. **动态权限**: 支持运行时修改角色权限配置
5. **级联保护**: 删除角色前检查是否有用户在使用

## 📈 性能优化

1. **客户端权限缓存**: 客户端权限预定义，无需数据库查询
2. **角色权限预加载**: 用户登录时一次性加载所有权限
3. **权限检查缓存**: 同一请求中的权限检查结果可复用
4. **索引优化**: 权限相关表都有适当的数据库索引

TranSync 的颗粒化权限系统为企业级应用提供了完整、安全、可扩展的权限管理解决方案。
