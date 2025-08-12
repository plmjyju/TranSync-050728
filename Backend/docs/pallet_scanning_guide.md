# 打板管理 API 流程指南

## 完整打板流程

### 1. 创建 Forecast（预报单）

```http
POST /api/client/forecasts
```

**请求体:**

```json
{
  "mawb": "784-12345678",
  "flight_no": "CA123",
  "departure_port": "PEK",
  "destination_port": "LAX",
  "etd": "2025-08-01T10:00:00Z",
  "eta": "2025-08-01T22:00:00Z",
  "weight": 1000.5,
  "box_count": 50,
  "primary_service": "空运出口",
  "remark": "预报单备注"
}
```

**响应:**

```json
{
  "id": 1,
  "forecast_code": "IB0A001-250801A",
  "mawb": "784-12345678",
  "flight_no": "CA123",
  "status": "draft"
}
```

### 2. 为预报单创建航空板

```http
POST /api/warehouse/pallets
```

**请求体:**

```json
{
  "forecast_id": 1,
  "pallet_code": "PMC001",
  "pallet_type": "PMC",
  "length_cm": 318,
  "width_cm": 224,
  "height_cm": 162,
  "location_code": "W2-R12-A1"
}
```

**响应:**

```json
{
  "id": 1,
  "pallet_code": "PMC001",
  "forecast_id": 1,
  "pallet_type": "PMC",
  "status": "pending",
  "box_count": 0,
  "weight_kg": "0.00",
  "forecast": {
    "forecast_code": "IB0A001-250801A",
    "mawb": "784-12345678"
  }
}
```

### 3. 扫描包裹绑定到板

```http
POST /api/warehouse/pallets/:pallet_id/scan-package
```

**支持的扫描方式:**

**方式 1: 扫描包裹编号/箱唛号**

```json
{
  "package_code": "PKG001"
}
```

**方式 2: 扫描追踪号**

```json
{
  "tracking_no": "1Z12345E1234567890"
}
```

**方式 3: 扫描主运单号(MAWB)**

```json
{
  "mawb": "784-12345678"
}
```

**方式 4: 扫描分运单号(HAWB)**

```json
{
  "hawb": "HAWB123456"
}
```

**成功响应:**

```json
{
  "message": "包裹绑定成功",
  "pallet": {
    "id": 1,
    "pallet_code": "PMC001",
    "box_count": 1,
    "weight_kg": "10.50",
    "packages": [
      {
        "id": 1,
        "package_code": "PKG001",
        "weight_kg": "10.50",
        "status": "prepared"
      }
    ]
  },
  "scanned_package": {
    "id": 1,
    "package_code": "PKG001",
    "weight_kg": "10.50"
  }
}
```

**错误响应示例:**

```json
{
  "error": "包裹不属于该预报单",
  "details": {
    "package_forecast": "IB0A002-250801B",
    "pallet_forecast": "IB0A001-250801A"
  }
}
```

```json
{
  "error": "包裹已绑定到其他板",
  "details": {
    "current_pallet": "PMC002"
  }
}
```

### 4. 查看板详情及包裹列表

```http
GET /api/warehouse/pallets/:pallet_id/packages
```

**查询参数:**

- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 20)

**响应:**

```json
{
  "pallet": {
    "id": 1,
    "pallet_code": "PMC001",
    "pallet_type": "PMC",
    "status": "pending",
    "location_code": "W2-R12-A1",
    "box_count": 3,
    "weight_kg": "32.50",
    "is_unpacked": false,
    "forecast": {
      "forecast_code": "IB0A001-250801A",
      "mawb": "784-12345678",
      "flight_no": "CA123"
    }
  },
  "packages": [
    {
      "id": 1,
      "package_code": "PKG001",
      "weight_kg": "10.50",
      "status": "prepared",
      "client": {
        "username": "客户A"
      }
    },
    {
      "id": 2,
      "package_code": "PKG002",
      "weight_kg": "12.00",
      "status": "prepared",
      "client": {
        "username": "客户B"
      }
    }
  ],
  "pagination": {
    "total": 3,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

### 5. 移除板上的包裹（如果扫错了）

```http
POST /api/warehouse/pallets/:pallet_id/remove-package
```

**请求体:**

```json
{
  "package_id": 1
}
```

**响应:**

```json
{
  "message": "包裹移除成功",
  "removed_package": {
    "id": 1,
    "package_code": "PKG001"
  },
  "pallet_stats": {
    "box_count": 2,
    "total_weight": "22.00"
  }
}
```

### 6. 板入仓操作

```http
POST /api/warehouse/pallets/:pallet_id/inbound
```

**请求体:**

```json
{
  "location_code": "W2-R12-A1"
}
```

**功能:**

- 状态从 `pending` → `stored`
- 记录入仓时间
- 更新位置信息

## 扫描验证逻辑

### 扫描时系统会进行以下验证:

1. **包裹存在性验证**

   - 检查包裹编号/追踪号/箱号是否存在

2. **预报单归属验证**

   - 确保包裹属于当前板所在的预报单
   - 防止跨预报单绑定

3. **重复绑定验证**

   - 检查包裹是否已绑定到其他板
   - 检查包裹是否已绑定到当前板

4. **自动统计更新**
   - 实时更新板的包裹数量
   - 实时计算板的总重量
   - 记录操作日志

## 前端界面建议

### 打板管理页面结构:

```
预报单: IB0A001-250801A | MAWB: 784-12345678 | 航班: CA123
┌─────────────────────────────────────────────────────────┐
│ 板列表                                                    │
├─────────────────────────────────────────────────────────┤
│ PMC001 | PMC | W2-R12-A1 | 3箱 | 32.5kg | [扫描包裹]    │
│ PMC002 | PMC | W2-R13-B2 | 5箱 | 45.2kg | [扫描包裹]    │
│ [新增板子]                                                │
└─────────────────────────────────────────────────────────┘

点击"扫描包裹"进入板详情:
┌─────────────────────────────────────────────────────────┐
│ 板号: PMC001 | 类型: PMC | 位置: W2-R12-A1              │
│ 包裹数: 3 | 总重: 32.5kg                                │
├─────────────────────────────────────────────────────────┤
│ 扫描区域: [___________________] [扫描]                  │
├─────────────────────────────────────────────────────────┤
│ 包裹列表:                                                │
│ ✓ PKG001 | 10.5kg | 客户A | [移除]                     │
│ ✓ PKG002 | 12.0kg | 客户B | [移除]                     │
│ ✓ PKG003 | 10.0kg | 客户C | [移除]                     │
└─────────────────────────────────────────────────────────┘
```

### 扫描反馈建议:

- **成功**: 绿色提示 + 音效，显示包裹信息
- **失败**: 红色提示 + 错误原因
- **实时更新**: 包裹数量和重量自动刷新

## 数据库更新

记得运行以下 SQL 为 packages 表添加航空运输字段:

```sql
-- 添加MAWB和HAWB字段
ALTER TABLE `packages`
ADD COLUMN `tracking_no` VARCHAR(50) NULL COMMENT '追踪号/运单号' AFTER `package_code`,
ADD COLUMN `mawb` VARCHAR(50) NULL COMMENT '主运单号(Master Air Waybill)' AFTER `tracking_no`,
ADD COLUMN `hawb` VARCHAR(50) NULL COMMENT '分运单号(House Air Waybill)' AFTER `mawb`,
ADD INDEX `idx_tracking_no` (`tracking_no`),
ADD INDEX `idx_mawb` (`mawb`),
ADD INDEX `idx_hawb` (`hawb`);
```

## MAWB 同步功能

当货代或运营人员更新预报单的 MAWB 号时，系统会自动同步更新该预报单下所有包裹的 MAWB 字段：

### 更新 MAWB 的端点：

- `PATCH /api/agent/forecasts/:id/mawb` - 货代更新
- `PATCH /api/client/forecasts/:id/mawb` - 客户端更新
- `PATCH /api/omp/forecasts/:id/mawb` - 运营管理更新

### 同步机制：

1. 更新预报单 MAWB
2. 自动同步到该预报单下所有包裹
3. 使用数据库事务确保数据一致性
4. 记录操作日志

详细说明请参考：[MAWB 同步功能指南](./mawb_sync_guide.md)
