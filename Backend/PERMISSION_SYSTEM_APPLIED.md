# TranSync 权限系统应用总结

## 权限系统架构

### 1. 系统访问权限

为每个端口设置了基础访问权限：

- `client.access` - 客户端系统访问权限
- `omp.access` - OMP 系统访问权限
- `warehouse.access` - 仓库系统访问权限
- `agent.access` - 货代系统访问权限
- `wms.access` - WMS 系统访问权限

### 2. 权限检查流程

#### A. 端口级别权限控制

在 `utils/createClientAppRouter.js` 中实现：

```javascript
// 客户端特殊处理（登录路由跳过认证）
if (clientType === "client") {
  // 条件认证：登录路由跳过，其他路由需要认证
}
// 其他端口需要认证 + 系统访问权限
else {
  app.use(
    prefix,
    authenticate,
    checkPermission(`${clientType}.access`),
    router
  );
}
```

#### B. 路由级别权限控制

在具体路由中添加细粒度权限：

```javascript
router.get("/", authenticate, checkPermission("client.package.view"), asyncHandler(...))
```

### 3. 客户端权限（Client）

客户端用户拥有默认权限，无需数据库查询：

- `client.access` - 系统访问
- `client.forecast.view` - 查看预报单
- `client.package.view` - 查看包裹
- `client.packages.edit` - 编辑包裹
- `client.dashboard.view` - 查看仪表板
- `client.statistics.view` - 查看统计信息

### 4. 其他端口权限

通过角色-权限表进行数据库查询验证：

#### Agent (货代) 权限

- `agent.access` - 系统访问权限
- `agent.forecast.view/create/edit` - 预报单管理
- `agent.package.create/edit` - 包裹管理
- `agent.hawb.manage` - HAWB 分运单号管理

#### OMP (运营管理) 权限

- `omp.access` - 系统访问权限
- `omp.forecast.view/edit/batch` - 预报单管理
- `omp.statistics.view` - 统计查看
- `omp.hawb.manage` - 全局 HAWB 管理
- `omp.operation_requirements.*` - 操作需求管理

#### Warehouse (仓库) 权限

- `warehouse.access` - 系统访问权限
- `warehouse.pallet.*` - 航空板管理（查看、创建、编辑、扫描、入仓、拆板、出库、归还、日志）
- `warehouse.delivery_order.*` - 提货单管理
- `warehouse.forecast.*` - 预报单状态管理
- `warehouse.location.*` - 库位管理
- `warehouse.outbound.*` - 出库管理

#### WMS (仓库管理系统) 权限

- `wms.access` - 系统访问权限
- `wms.forecast.view` - 查看预报单
- `wms.inbound.*` - 入库管理

### 5. 已应用权限的文件

#### 核心权限文件

- `middlewares/checkPermission.js` - 权限检查中间件
- `middlewares/authenticate.js` - 认证中间件
- `seed/permissions.js` - 权限种子数据
- `utils/createClientAppRouter.js` - 端口路由权限控制

#### 已更新的路由文件

- `routes/client/packages.js` - 添加包裹查看权限
- `routes/client/forecasts.js` - 添加预报单查看权限
- `routes/agent/forecasts.js` - 已有权限检查
- `routes/warehouse/pallet.js` - 已有权限检查
- `routes/omp/forecasts.js` - 添加预报单查看权限
- `routes/wms/forecasts.js` - 添加预报单查看权限

### 6. 权限检查逻辑

#### 客户端用户

```javascript
if (user.userType === "client") {
  // 检查预定义权限列表
  if (clientPermissions.includes(permissionName)) {
    return next(); // 允许访问
  }
  return res.status(403).json({ message: "权限不足" });
}
```

#### 其他用户类型

```javascript
// 查询用户角色和权限
const role = await Role.findByPk(user.role_id, {
  include: [{ model: Permission, as: "permissions" }],
});

// 检查是否具有所需权限
const hasPermission = role.permissions.some((p) => p.name === permissionName);
```

### 7. 错误处理

- 中文错误消息
- 统一的 403 权限不足响应
- 详细的权限拒绝日志

### 8. 使用方式

#### 在路由中应用权限

```javascript
import { authenticate } from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";

router.get(
  "/endpoint",
  authenticate, // 先验证身份
  checkPermission("module.action"), // 再检查权限
  asyncHandler(async (req, res) => {
    // 业务逻辑
  })
);
```

#### 端口访问控制

每个端口在挂载时自动应用对应的 `${clientType}.access` 权限检查。

## 总结

权限系统已成功应用到所有端口：

1. ✅ 端口级别访问控制
2. ✅ 路由级别细粒度权限
3. ✅ 客户端默认权限处理
4. ✅ 数据库角色权限查询
5. ✅ 统一错误处理和中文消息
6. ✅ 完整的权限种子数据

系统现在具备完整的多级权限控制能力，确保不同用户只能访问其被授权的功能模块。
