# Pallet 系统设计文档

## 概述

Pallet 系统是为了管理航空板（ULD）在仓库中的生命周期而设计的，支持从入仓到归还的完整流程。

## 数据结构

### 三级结构关系

```
Forecast（预报单）
  └── Pallet（航空板）
        └── Package（包裹）
              └── PackageItem（商品项）
```

### Pallet 模型字段

#### 基本信息

- `pallet_code`: 板号（唯一），如 PMC001、LD3-002
- `forecast_id`: 所属预报单 ID
- `pallet_type`: 板类型（PMC、LD3、AKE、木板等）

#### 物理属性

- `length_cm/width_cm/height_cm`: 尺寸（厘米）
- `weight_kg`: 总重量（公斤）
- `box_count`: 板上包裹数量

#### 位置和状态

- `location_code`: 仓库内定位编码（如 A1-B2-C3）
- `status`: 板状态枚举
  - `pending`: 待入仓
  - `stored`: 已入仓
  - `waiting_clear`: 等待出清
  - `unpacked`: 已拆板
  - `dispatched`: 已出库
  - `returned`: 空板已归还

#### 操作状态

- `is_unpacked`: 是否已拆板
- `is_full_board`: 是否整板出库

#### 时间记录

- `inbound_time`: 实际入仓时间
- `returned_time`: 板归还时间
- `position_updated_at`: 位置/状态最近更新时间

#### 操作信息

- `operator`: 最近操作人姓名
- `operator_id`: 最近操作人 ID
- `remark`: 备注信息

## 业务流程

### 1. 板创建

```javascript
POST /api/warehouse/pallets
{
  "pallet_code": "PMC001",
  "forecast_id": 1,
  "pallet_type": "PMC",
  "length_cm": 318,
  "width_cm": 224,
  "height_cm": 162,
  "location_code": "A1-B2"
}
```

### 2. 板入仓

```javascript
POST /api/warehouse/pallets/:id/inbound
{
  "location_code": "A1-B2-C3"
}
```

- 状态：`pending` → `stored`
- 设置 `inbound_time`
- 记录位置

### 3. 拆板操作

```javascript
POST /api/warehouse/pallets/:id/unpack
{
  "remark": "拆板完成，包裹已分拣"
}
```

- 设置 `is_unpacked = true`
- 状态：`stored` → `unpacked`
- 包裹可单独管理

### 4. 板出库

```javascript
POST /api/warehouse/pallets/:id/dispatch
{
  "is_full_board": true,
  "remark": "整板出库"
}
```

- 状态：→ `dispatched`
- 标记出库方式（整板/拆包）

### 5. 板归还

```javascript
POST /api/warehouse/pallets/:id/return
{
  "remark": "空板归还航空公司"
}
```

- 状态：→ `returned`
- 设置 `returned_time`

## PalletLog 审计日志

### 记录的操作类型

- `created`: 板创建
- `inbound`: 入仓
- `location_updated`: 位置变更
- `unpacked`: 拆板
- `packed`: 装板
- `dispatched`: 出库
- `returned`: 归还
- `status_changed`: 状态变更
- `weight_updated`: 重量更新
- `remark_added`: 添加备注

### 日志字段

- `old_status/new_status`: 状态变更前后
- `old_location/new_location`: 位置变更前后
- `operator/operator_id`: 操作人信息
- `description`: 操作描述
- `metadata`: 额外元数据（JSON）

## API 接口

### 查询接口

- `GET /api/warehouse/pallets` - 获取板列表
- `GET /api/warehouse/pallets/:id/logs` - 获取板操作日志
- `GET /api/warehouse/pallets/statistics` - 获取板状态统计

### 操作接口

- `POST /api/warehouse/pallets` - 创建新板
- `PUT /api/warehouse/pallets/:id` - 更新板信息
- `POST /api/warehouse/pallets/:id/inbound` - 板入仓
- `POST /api/warehouse/pallets/:id/unpack` - 拆板
- `POST /api/warehouse/pallets/:id/dispatch` - 板出库
- `POST /api/warehouse/pallets/:id/return` - 板归还

## 查询参数支持

- `status`: 按状态筛选
- `location_code`: 按位置筛选
- `forecast_id`: 按预报单筛选
- `is_unpacked`: 按拆板状态筛选
- `search`: 模糊搜索（板号、类型、位置）

## 使用场景示例

### 1. FTZ 监管仓场景

```javascript
// 航班到达，板入仓
await palletService.inbound(palletId, "A1-R2-L3");

// 海关查验需要拆板
await palletService.unpack(palletId, "海关查验拆板");

// 包裹分拣完成，单独处理
await packageService.updateStatus(packageIds, "sorted");

// 空板归还航空公司
await palletService.return(palletId, "归还国航");
```

### 2. 集运仓场景

```javascript
// 整板出库到客户
await palletService.dispatch(palletId, {
  is_full_board: true,
  remark: "整板交付客户A",
});
```

### 3. 超期提醒

```javascript
// 查询超期未归还的板
const overduePallets = await Pallet.findAll({
  where: {
    status: ["stored", "unpacked", "dispatched"],
    inbound_time: {
      [Op.lt]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7天前
    },
    returned_time: null,
  },
});
```

## 数据库索引优化

- `forecast_id`: 按预报单查询
- `status`: 状态筛选
- `location_code`: 位置查询
- `is_unpacked`: 拆板状态筛选
- `created_at`: 时间排序（日志表）

## 注意事项

1. **事务安全**: 所有状态变更操作都在数据库事务中执行
2. **日志完整**: 每次状态变更都会自动记录详细日志
3. **权限控制**: 需要认证用户才能进行操作
4. **状态校验**: 严格的状态转换校验，防止非法操作
5. **关联约束**: 删除预报单时级联删除相关板和日志
