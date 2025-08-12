# 包裹级别入库确认流程

## 业务流程概述

根据更新的需求，入库流程现在需要明确到 package（包裹）级别的入库确认：

1. **仓库拿到货物** → 根据 AWB（forecast）和 DO 单
2. **扫描箱唛号** → 扫描 package 上的箱唛号（package_code）进行统计
3. **数量验证** → 如果数目对得上，DO 和 FC 单都正常
4. **异常处理** → 数目不符则报异常
5. **状态更新** → 扫描后的 package 状态更新为"已入库"（stored）

## 技术实现

### 1. 包裹扫描入库 API

#### 单个包裹扫描

```
POST /api/warehouse/package-storage/scan-package-storage
```

**请求参数：**

```json
{
  "package_code": "PKG001", // 箱唛号
  "do_number": "DO250802-01", // DO单号
  "warehouse_location": "A-01-B-15", // 仓库位置
  "operator_notes": "正常入库" // 操作备注
}
```

**响应结果：**

```json
{
  "message": "包裹入库扫描成功",
  "package_info": {
    "package_code": "PKG001",
    "tracking_no": "TRK123456",
    "forecast_code": "FC250802-001",
    "mawb": "AWB123456",
    "status": "stored",
    "warehouse_location": "A-01-B-15",
    "storage_time": "2025-08-02T10:30:00Z",
    "storage_operator": "warehouse_user"
  },
  "do_info": {
    "do_number": "DO250802-01",
    "management_type": "package"
  }
}
```

#### 批量包裹扫描

```
POST /api/warehouse/package-storage/batch-scan-storage
```

**请求参数：**

```json
{
  "package_codes": ["PKG001", "PKG002", "PKG003"],
  "do_number": "DO250802-01",
  "warehouse_location": "A-01-B-15",
  "operator_notes": "批量入库操作"
}
```

### 2. DO 单入库验证 API

#### 验证 DO 单入库状态

```
POST /api/warehouse/package-storage/verify-do-storage
```

**请求参数：**

```json
{
  "do_number": "DO250802-01"
}
```

**响应结果：**

```json
{
  "do_info": {
    "do_number": "DO250802-01",
    "management_type": "package",
    "status": "partially_stored",
    "needs_exception": true
  },
  "storage_summary": {
    "total_packages": 10,
    "stored_packages": 8,
    "pending_packages": 2,
    "storage_rate": "80.0%"
  },
  "forecast_breakdown": [
    {
      "forecast_code": "FC250802-001",
      "mawb": "AWB123456",
      "total": 5,
      "stored": 4,
      "pending": 1,
      "packages": [...]
    }
  ],
  "pending_packages": [
    {
      "package_code": "PKG009",
      "tracking_no": "TRK009",
      "forecast_code": "FC250802-001",
      "status": "arrived"
    }
  ]
}
```

### 3. 增强版仓库确认 API

#### 基于包裹扫描的仓库确认

```
POST /api/warehouse/enhanced-confirm/{do_id}/enhanced-warehouse-confirm
```

**请求参数：**

```json
{
  "scanned_packages": ["PKG001", "PKG002", "PKG003"], // 扫描到的箱唛号
  "warehouse_location": "A-01-B-15",
  "operator_notes": "入库确认",
  "confirm_all": false // 是否确认所有包裹
}
```

**响应结果：**

```json
{
  "message": "仓库确认完成，但存在异常",
  "do_info": {
    "do_number": "DO250802-01",
    "status": "incident",
    "has_discrepancy": true
  },
  "confirmation_summary": {
    "total_expected": 10,
    "confirmed": 8,
    "pending": 2,
    "confirmation_rate": "80.0%"
  },
  "scan_results": [
    {
      "package_code": "PKG001",
      "status": "success",
      "message": "扫描成功",
      "forecast_code": "FC250802-001"
    }
  ],
  "forecast_breakdown": [
    {
      "forecast_code": "FC250802-001",
      "mawb": "AWB123456",
      "total": 5,
      "confirmed": 4,
      "pending": 1
    }
  ],
  "next_actions": ["请报告异常情况", "核实缺失包裹原因", "联系相关部门处理"]
}
```

## 数据模型更新

### Package 模型状态流转

```
prepared → arrived → sorted → cleared → stored → delivered
                                         ↑
                                    入库扫描确认
```

### PackageLog 记录操作日志

每次扫描入库都会记录详细的操作日志：

```json
{
  "package_id": 123,
  "action": "storage_scanned",
  "operator": "warehouse_user",
  "operator_id": 456,
  "details": {
    "do_number": "DO250802-01",
    "warehouse_location": "A-01-B-15",
    "scan_time": "2025-08-02T10:30:00Z",
    "notes": "正常入库"
  }
}
```

## 异常处理场景

### 1. 一个 FC 对应多个 DO 的情况

系统会按 DO 单分别处理，每个 DO 的入库状态独立管理：

- FC250802-001 → DO250802-01 (部分包裹)
- FC250802-001 → DO250802-02 (其余包裹)

### 2. 包裹数量不符的异常

- **缺少包裹**：系统标记为异常，DO 状态设为 `incident`
- **多出包裹**：验证包裹是否属于该 DO，不属于则报错
- **包裹状态异常**：包裹已入库或状态不正确时给出警告

### 3. 扫描验证逻辑

```javascript
// 验证包裹是否在DO单中
async function validatePackageInDO(packageId, deliveryOrderId) {
  // 1. 检查包裹级DO关联
  const packageDORelation = await DeliveryOrderPackage.findOne({
    where: { package_id: packageId, delivery_order_id: deliveryOrderId },
  });

  // 2. 检查板级DO关联（通过板间接关联）
  const palletDORelation = await Package.findByPk(packageId, {
    include: [
      {
        model: Pallet,
        include: [
          {
            model: DeliveryOrderPallet,
            where: { delivery_order_id: deliveryOrderId },
          },
        ],
      },
    ],
  });

  return packageDORelation || palletDORelation;
}
```

## 权限控制

### 新增权限

- `warehouse.packages.edit` - 编辑包裹信息
- `warehouse.delivery_order.confirm` - 确认 DO 单

### API 权限映射

| API            | 权限要求                           |
| -------------- | ---------------------------------- |
| 包裹扫描入库   | `warehouse.packages.edit`          |
| DO 入库验证    | `warehouse.delivery_orders.view`   |
| 增强版仓库确认 | `warehouse.delivery_order.confirm` |

## 前端集成建议

### 1. 扫描界面

- 扫码枪输入箱唛号
- 显示 DO 单信息
- 实时显示扫描进度
- 异常包裹高亮提示

### 2. 入库确认界面

- 显示 DO 单包裹清单
- 支持手动勾选确认
- 显示 Forecast 分组统计
- 异常处理流程引导

### 3. 状态监控界面

- 实时显示入库进度
- 异常情况告警
- 操作日志查看
- 数据统计报表

这个更新后的入库流程确保了包裹级别的精确管理，支持复杂的多 DO、多 FC 场景，并提供了完整的异常处理机制。
