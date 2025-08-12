# 板子分配和库位管理系统

## 概述

本系统实现了包裹到仓后的分板处理和库位管理功能。系统支持板子编号生成、包裹分配、操作需求管理和库位分配等功能。

## 功能特性

### 1. 包裹分板处理

- ✅ Package 模型添加板号字段 (`assigned_pallet_number`)
- ✅ 分板后包裹状态追踪
- ✅ 操作需求关联到分板流程

### 2. 板子分配管理 (PalletAllocation)

- ✅ 板子编号自动生成和管理
- ✅ AWB 编号关联
- ✅ 包裹总数和分配数量追踪
- ✅ 操作需求集成
- ✅ 库位分配和变更
- ✅ 分配状态管理
- ✅ 优先级管理

### 3. 库位管理 (WarehouseLocation)

- ✅ 多层级库位编号系统 (区域-巷道-货架-层级)
- ✅ 多种库位类型支持
- ✅ 容量和占用管理
- ✅ 特殊要求配置
- ✅ 库位状态管理 (启用/停用/阻塞)
- ✅ 批量创建库位

### 4. 操作日志追踪

- ✅ 板子分配操作日志 (PalletAllocationLog)
- ✅ 库位操作日志 (WarehouseLocationLog)
- ✅ 详细操作记录和审计

## 数据模型

### PalletAllocation (板子分配)

```javascript
{
  id: BIGINT,                    // 主键
  pallet_number: STRING(50),     // 板子编号 (唯一)
  awb_number: STRING(50),        // AWB编号
  total_package_count: INTEGER,  // 板里的箱子总数
  allocated_package_count: INTEGER, // 已分配箱子数
  warehouse_location_id: BIGINT, // 库位ID
  operation_requirements: JSON,  // 操作需求列表
  status: ENUM,                  // 分板状态
  priority_level: ENUM,          // 优先级
  notes: TEXT,                   // 备注
  created_by: BIGINT,            // 创建人
  allocated_by: BIGINT,          // 分配操作员
  allocated_at: DATE,            // 分配完成时间
  stored_by: BIGINT,             // 入库操作员
  stored_at: DATE                // 入库时间
}
```

**状态类型:**

- `created`: 已创建
- `allocating`: 分配中
- `completed`: 分配完成
- `stored`: 已入库
- `shipped`: 已出库
- `cancelled`: 已取消

### WarehouseLocation (库位)

```javascript
{
  id: BIGINT,                    // 主键
  location_code: STRING(30),     // 库位编号 (如: A-01-02-03)
  location_name: STRING(100),    // 库位名称
  warehouse_zone: STRING(10),    // 仓库区域 (A、B、C区)
  aisle: STRING(10),             // 巷道号 (01、02、03)
  rack: STRING(10),              // 货架号 (01、02、03)
  level: STRING(10),             // 层级号 (01、02、03)
  location_type: ENUM,           // 库位类型
  capacity: INTEGER,             // 库位容量
  current_occupancy: INTEGER,    // 当前占用
  max_weight_kg: FLOAT,          // 最大承重
  max_height_cm: FLOAT,          // 最大高度
  temperature_min: FLOAT,        // 最低温度
  temperature_max: FLOAT,        // 最高温度
  is_active: BOOLEAN,            // 是否启用
  is_blocked: BOOLEAN,           // 是否阻塞
  block_reason: STRING(200),     // 阻塞原因
  special_requirements: JSON,    // 特殊要求
  notes: TEXT                    // 备注
}
```

**库位类型:**

- `standard`: 标准库位
- `oversized`: 超大件库位
- `cold_storage`: 冷库库位
- `hazmat`: 危险品库位
- `secure`: 安全库位
- `temporary`: 临时库位
- `staging`: 暂存区

### Package 更新字段

```javascript
{
  // 新增字段
  assigned_pallet_number: STRING(50), // 分配的板号
}
```

## API 接口

### 板子分配管理

#### 1. 创建板子分配

```http
POST /api/warehouse/pallet-allocations
```

**请求体:**

```json
{
  "pallet_number": "PLT-20250803-001",
  "awb_number": "AWB123456789",
  "total_package_count": 50,
  "operation_requirements": [1, 2, 3],
  "warehouse_location_id": 1,
  "priority_level": "high",
  "notes": "加急处理"
}
```

#### 2. 获取板子分配列表

```http
GET /api/warehouse/pallet-allocations
```

**查询参数:**

- `status`: 状态筛选
- `awb_number`: AWB 筛选
- `warehouse_location_id`: 库位筛选
- `search`: 搜索关键词
- `page`: 页码
- `limit`: 每页数量

#### 3. 分配包裹到板子

```http
POST /api/warehouse/pallet-allocations/:pallet_id/allocate-packages
```

**请求体:**

```json
{
  "package_ids": [1, 2, 3, 4, 5]
}
```

#### 4. 更新板子库位

```http
PATCH /api/warehouse/pallet-allocations/:pallet_id/location
```

**请求体:**

```json
{
  "warehouse_location_id": 2,
  "notes": "变更库位"
}
```

#### 5. 获取板子详情

```http
GET /api/warehouse/pallet-allocations/:pallet_id
```

### 库位管理

#### 1. 创建库位

```http
POST /api/warehouse/warehouse-locations
```

**请求体:**

```json
{
  "location_code": "A-01-01-01",
  "location_name": "A区01巷01架01层",
  "warehouse_zone": "A",
  "aisle": "01",
  "rack": "01",
  "level": "01",
  "location_type": "standard",
  "capacity": 2,
  "max_weight_kg": 1000,
  "max_height_cm": 200
}
```

#### 2. 获取库位列表

```http
GET /api/warehouse/warehouse-locations
```

**查询参数:**

- `warehouse_zone`: 区域筛选
- `location_type`: 类型筛选
- `is_active`: 状态筛选
- `is_blocked`: 阻塞状态筛选
- `available_only`: 只显示可用库位
- `search`: 搜索关键词

#### 3. 批量创建库位

```http
POST /api/warehouse/warehouse-locations/batch
```

**请求体:**

```json
{
  "warehouse_zone": "A",
  "aisle_range": { "start": "01", "end": "05" },
  "rack_range": { "start": "01", "end": "10" },
  "level_range": { "start": "01", "end": "04" },
  "location_type": "standard",
  "capacity": 2,
  "max_weight_kg": 1000
}
```

#### 4. 阻塞/解除阻塞库位

```http
PATCH /api/warehouse/warehouse-locations/:location_id/block
```

**请求体:**

```json
{
  "is_blocked": true,
  "block_reason": "设备维修",
  "notes": "预计维修3天"
}
```

#### 5. 启用/停用库位

```http
PATCH /api/warehouse/warehouse-locations/:location_id/toggle-status
```

## 使用流程

### 1. 初始化库位数据

```bash
node seed/seedWarehouseLocations.js
```

### 2. 分板流程

1. **创建板子分配**

   - 前端生成板子编号
   - 输入 AWB 编号和箱子总数
   - 选择操作需求
   - 分配库位（可选）

2. **分配包裹**

   - 选择属于该 AWB 的包裹
   - 批量分配到板子
   - 更新包裹的 `assigned_pallet_number`
   - 记录分配操作日志

3. **库位管理**

   - 为板子分配合适的库位
   - 支持库位变更
   - 监控库位占用情况

4. **状态追踪**
   - 分配中 → 分配完成 → 已入库 → 已出库
   - 完整的操作日志记录

### 3. 库位编号规则

- 格式: `{区域}-{巷道}-{货架}-{层级}`
- 示例: `A-01-02-03` (A 区 01 巷 02 架 03 层)
- 支持区域: A-Z
- 巷道/货架/层级: 01-99

### 4. 特殊要求配置

```json
{
  "temperature_monitoring": true,
  "access_control": true,
  "special_handling": ["fragile", "cold_chain"],
  "security_cameras": true,
  "crane_access": true
}
```

## 权限配置

### 仓库权限

- `warehouse.pallet.view` - 查看板子信息
- `warehouse.pallet.create` - 创建板子分配
- `warehouse.pallet.edit` - 编辑板子信息
- `warehouse.pallet.allocate` - 分配包裹到板子
- `warehouse.location.view` - 查看库位信息
- `warehouse.location.create` - 创建库位
- `warehouse.location.edit` - 编辑库位信息

## 默认数据

### 示例库位

系统提供 7 个区域的示例库位：

- **A 区**: 标准存储区
- **B 区**: 冷库存储区 (温控)
- **C 区**: 危险品存储区
- **D 区**: 超大件存储区
- **E 区**: 安全存储区 (高价值物品)
- **F 区**: 暂存区 (临时存放)
- **G 区**: 临时库位 (灵活使用)

### 库位特殊要求示例

- 冷库: 温度监控 + 访问控制
- 危险品: 消防系统 + 特殊认证
- 安全区: 监控摄像 + 身份验证
- 超大件: 吊车通道 + 加固结构

## 注意事项

1. **板号唯一性**: 板子编号必须全局唯一
2. **AWB 关联**: 只能分配属于对应 AWB 的包裹
3. **容量限制**: 分配包裹不能超过板子容量
4. **库位状态**: 只能使用启用且未阻塞的库位
5. **操作日志**: 所有关键操作都有详细日志记录
6. **权限控制**: 不同角色有不同的操作权限
7. **数据一致性**: 使用事务确保数据一致性
