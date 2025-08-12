# 权限验证系统总结

## 权限验证架构

### 中间件组合

所有需要权限控制的路由都使用以下中间件组合：

```javascript
router.get(
  "/endpoint",
  authenticate, // 验证用户身份
  checkPermission("permission.name"), // 检查特定权限
  async (req, res) => {
    // 路由处理逻辑
  }
);
```

### 权限分级

#### 1. 身份验证 (authenticate)

- 验证 JWT token
- 确保用户已登录
- 将用户信息附加到 `req.user`

#### 2. 权限检查 (checkPermission)

- 验证用户是否拥有特定权限
- 基于角色和权限表进行检查
- 拒绝无权限用户的访问

## 各端权限配置

### 🏢 客户端 (Client) 权限

**模块**: `client`

| 权限名称                 | 显示名称       | 适用路由                  | 说明                         |
| ------------------------ | -------------- | ------------------------- | ---------------------------- |
| `client.forecast.view`   | 查看预报单信息 | `/client/forecasts/*`     | 只能查看包含自己包裹的预报单 |
| `client.package.view`    | 查看包裹信息   | `/client/packages/*`      | 只能查看自己的包裹           |
| `client.statistics.view` | 查看统计信息   | `/client/forecasts/stats` | 查看自己的包裹统计           |

**权限范围限制**:

- 数据隔离: `WHERE client_id = req.user.id`
- 只读权限: 无创建、修改、删除权限
- 范围限制: 只能访问与自己相关的数据

### 🚚 货代 (Agent) 权限

**模块**: `agent`

| 权限名称                | 显示名称           | 适用路由                             | 说明                 |
| ----------------------- | ------------------ | ------------------------------------ | -------------------- |
| `agent.forecast.view`   | 查看预报单         | `GET /agent/forecasts/*`             | 查看自己创建的预报单 |
| `agent.forecast.create` | 创建预报单         | `POST /agent/forecasts`              | 创建新预报单         |
| `agent.forecast.edit`   | 编辑预报单         | `PATCH /agent/forecasts/:id/mawb`    | 编辑 MAWB 等信息     |
| `agent.package.create`  | 添加包裹           | `POST /agent/forecasts/:id/packages` | 向预报单添加包裹     |
| `agent.package.edit`    | 编辑包裹           | `PATCH /agent/packages/*`            | 编辑包裹信息         |
| `agent.hawb.manage`     | 管理 HAWB 分运单号 | `PATCH /agent/forecasts/:id/hawb`    | 为客户分配 HAWB      |

**权限范围限制**:

- 数据范围: 只能操作自己创建的预报单
- MAWB 同步: 更新 MAWB 时自动同步到包裹
- HAWB 管理: 按客户分配分运单号

### 🏭 运营管理 (OMP) 权限

**模块**: `omp`

| 权限名称              | 显示名称               | 适用路由                            | 说明                 |
| --------------------- | ---------------------- | ----------------------------------- | -------------------- |
| `omp.forecast.view`   | 查看所有预报单         | `GET /omp/forecasts/*`              | 查看系统中所有预报单 |
| `omp.forecast.edit`   | 编辑所有预报单         | `PATCH /omp/forecasts/:id/mawb`     | 编辑任意预报单       |
| `omp.forecast.batch`  | 批量操作预报单         | `PATCH /omp/forecasts/batch-status` | 批量更新状态         |
| `omp.statistics.view` | 查看系统统计           | `GET /omp/forecasts/stats`          | 查看全局统计数据     |
| `omp.hawb.manage`     | 管理全局 HAWB 分运单号 | `PATCH /omp/forecasts/:id/hawb`     | 管理所有 HAWB 分配   |

**权限范围**:

- 全局权限: 可以操作所有用户的数据
- 系统管理: 批量操作和全局统计
- 审计日志: 所有操作都记录详细日志
- HAWB 全局管理: 可以查看和修改所有 HAWB 分配

### 📦 仓库管理 (Warehouse) 权限

**模块**: `warehouse`

| 权限名称                    | 显示名称       | 适用路由                                   | 说明                   |
| --------------------------- | -------------- | ------------------------------------------ | ---------------------- |
| `warehouse.access`          | 仓库系统访问   | 基础访问权限                               | 访问仓库系统的基础权限 |
| `warehouse.pallet.view`     | 查看航空板     | `GET /warehouse/pallets/*`                 | 查看板信息             |
| `warehouse.pallet.create`   | 创建航空板     | `POST /warehouse/pallets`                  | 创建新航空板           |
| `warehouse.pallet.edit`     | 编辑航空板     | `PATCH /warehouse/pallets/*`               | 编辑板信息             |
| `warehouse.pallet.scan`     | 扫描包裹到板   | `POST /warehouse/pallets/:id/scan-package` | 扫描绑定包裹           |
| `warehouse.pallet.inbound`  | 航空板入仓     | `POST /warehouse/pallets/:id/inbound`      | 板入仓操作             |
| `warehouse.pallet.unpack`   | 拆板操作       | `POST /warehouse/pallets/:id/unpack`       | 拆板操作               |
| `warehouse.pallet.dispatch` | 航空板出库     | `POST /warehouse/pallets/:id/dispatch`     | 板出库操作             |
| `warehouse.pallet.return`   | 航空板归还     | `POST /warehouse/pallets/:id/return`       | 板归还操作             |
| `warehouse.pallet.logs`     | 查看板操作日志 | `GET /warehouse/pallets/:id/logs`          | 查看操作历史           |

## 权限验证实现

### 路由保护示例

#### 客户端路由保护

```javascript
// 只能查看自己的包裹
router.get(
  "/forecasts",
  authenticate,
  checkPermission("client.forecast.view"),
  async (req, res) => {
    // 数据查询时自动过滤: WHERE client_id = req.user.id
    const forecasts = await db.Forecast.findAll({
      include: [
        {
          model: db.Package,
          where: { client_id: req.user.id },
          required: true,
        },
      ],
    });
  }
);
```

#### 货代路由保护

```javascript
// 只能操作自己创建的预报单
router.patch(
  "/forecasts/:id/mawb",
  authenticate,
  checkPermission("agent.forecast.edit"),
  async (req, res) => {
    // 验证所有权
    const forecast = await db.Forecast.findOne({
      where: {
        id: req.params.id,
        created_by: req.user.id, // 确保是自己创建的
      },
    });

    if (!forecast) {
      return res.status(404).json({ message: "预报单不存在或无权限修改" });
    }
  }
);
```

#### 运营管理路由保护

```javascript
// 可以操作所有数据，但需要记录日志
router.patch(
  "/forecasts/:id/mawb",
  authenticate,
  checkPermission("omp.forecast.edit"),
  async (req, res) => {
    // 无需所有权验证，但要记录操作日志
    await db.SystemLog.create({
      user_id: req.user.id,
      action: "update_forecast_mawb",
      target_id: req.params.id,
      description: `运营管理员更新MAWB`,
      ip_address: req.ip,
    });
  }
);
```

## 数据安全策略

### 1. 数据隔离

- **客户端**: 严格按用户 ID 过滤数据
- **货代**: 只能访问自己创建的预报单
- **运营**: 全局访问但记录操作日志

### 2. 权限继承

- 上级权限包含下级功能
- 运营 > 货代 > 客户端

### 3. 操作审计

- 所有修改操作记录日志
- 包含用户、时间、IP、操作内容
- 敏感操作（如 MAWB 更新）强制记录

### 4. 事务安全

- 使用数据库事务确保数据一致性
- 权限验证失败时立即回滚
- 防止部分更新导致的数据不一致

## 部署检查清单

### ✅ 必须验证的项目：

1. **权限种子数据**

   - [ ] 所有权限已添加到 `permissions.js`
   - [ ] 权限名称符合命名规范
   - [ ] 权限模块正确分类

2. **角色权限分配**

   - [ ] 客户端角色只有查看权限
   - [ ] 货代角色有适当的创建/编辑权限
   - [ ] 运营角色有全局管理权限
   - [ ] 仓库角色有操作权限

3. **路由保护**

   - [ ] 所有敏感路由都有 `authenticate` 中间件
   - [ ] 所有业务路由都有 `checkPermission` 中间件
   - [ ] 权限名称与种子数据一致

4. **数据安全**
   - [ ] 客户端路由有数据隔离过滤
   - [ ] 货代路由有所有权验证
   - [ ] 运营路由有操作日志记录

这样的权限验证系统确保了：

- 🔒 数据安全：用户只能访问授权的数据
- 🛡️ 权限隔离：不同角色有不同的操作权限
- 📋 操作审计：所有重要操作都有完整的审计记录
- 🔄 扩展性：易于添加新的权限和角色
