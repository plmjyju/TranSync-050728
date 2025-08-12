# 仓库确认流程指南

## 概述

仓库确认是货物到达仓库后的重要环节，仓库操作人员需要根据 DO 单核实实际到货的板数和箱数，确保货物数量的准确性。

## 主要功能

### 1. 获取 DO 仓库确认信息

```http
GET /api/warehouse/delivery-order/:id/warehouse-info
```

**响应示例：**

```json
{
  "do_number": "DO250803-01",
  "status": "arrived",
  "management_type": "pallet",
  "driver_info": {
    "driver_name": "张三",
    "driver_id_number": "123456789012345678",
    "vehicle_plate": "京A12345",
    "usdot_number": "DOT123456"
  },
  "pickup_info": {
    "pickup_location": "洛杉矶地仓A区",
    "pickup_details": "3号库位",
    "pickup_time": "2025-08-03T10:30:00Z"
  },
  "transport_info": {
    "departure_time": "2025-08-03T11:00:00Z",
    "arrival_time": "2025-08-03T15:30:00Z",
    "current_location": "总仓库卸货区",
    "target_warehouse": "总仓库A区"
  },
  "expected_quantities": {
    "pallet_count": 5,
    "package_count": 120,
    "total_weight_kg": 2500.5
  },
  "cargo_details": {
    "pallets": [...],
    "packages": [...],
    "mawb_summary": [
      {
        "mawb": "157-12345678",
        "hawbs": ["H001", "H002"],
        "forecast_codes": ["FC2025080301", "FC2025080302"],
        "pallet_count": 3,
        "package_count": 72
      }
    ]
  },
  "confirmation_template": {
    "actual_pallet_count": 5,
    "actual_package_count": 120,
    "warehouse_receiver": "",
    "discrepancy_notes": "",
    "remark": ""
  }
}
```

### 2. 仓库确认货物数量

```http
POST /api/warehouse/delivery-order/:id/warehouse-confirm
```

**请求参数：**

```json
{
  "actual_pallet_count": 5, // 实际到货板数
  "actual_package_count": 120, // 实际到货箱数
  "warehouse_receiver": "李四", // 仓库接收人
  "confirm_time": "2025-08-03T15:45:00Z", // 确认时间（可选）
  "discrepancy_notes": "第3板有2箱外包装轻微破损", // 差异说明（可选）
  "remark": "货物整体状况良好" // 备注（可选）
}
```

## 确认结果处理

### 数量一致（正常情况）

当实际到货数量与 DO 单一致时：

- DO 状态保持为 `arrived`
- 记录确认信息到 DO
- 可以继续进行入库操作

**响应示例：**

```json
{
  "message": "仓库确认完成，货物数量正常",
  "do_number": "DO250803-01",
  "status": "arrived",
  "confirmation_result": {
    "has_discrepancy": false,
    "expected_pallet_count": 5,
    "actual_pallet_count": 5,
    "expected_package_count": 120,
    "actual_package_count": 120,
    "discrepancies": []
  },
  "next_step": "可以继续进行入库操作"
}
```

### 数量不符（异常情况）

当实际到货数量与 DO 单不一致时：

- DO 状态变更为 `incident`
- 记录详细的差异信息
- 需要联系相关部门处理

**响应示例：**

```json
{
  "message": "仓库确认完成，发现货物差异，已标记为异常",
  "do_number": "DO250803-01",
  "status": "incident",
  "confirmation_result": {
    "has_discrepancy": true,
    "expected_pallet_count": 5,
    "actual_pallet_count": 4,
    "expected_package_count": 120,
    "actual_package_count": 98,
    "discrepancies": [
      {
        "type": "pallet_count",
        "expected": 5,
        "actual": 4,
        "difference": -1,
        "description": "板数不符：预期5板，实际4板"
      },
      {
        "type": "package_count",
        "expected": 120,
        "actual": 98,
        "difference": -22,
        "description": "箱数不符：预期120箱，实际98箱"
      }
    ]
  },
  "next_step": "请联系相关部门处理货物差异问题"
}
```

## 操作流程

1. **获取 DO 信息**

   - 使用 DO 编号查询待确认的货物信息
   - 查看预期的板数和箱数
   - 了解货物的 MAWB/HAWB 详情

2. **实地核查**

   - 清点实际到货的板数
   - 统计实际到货的箱数
   - 检查货物外观状况

3. **录入确认信息**

   - 填写实际板数和箱数
   - 填写接收人信息
   - 如有差异，填写详细说明

4. **系统处理**
   - 系统自动比对数量差异
   - 记录确认日志
   - 根据结果决定后续流程

## 异常处理

### 数量短缺

- 记录短缺的具体数量
- 在差异说明中描述可能原因
- 通知相关部门进行调查

### 数量超出

- 记录多出的具体数量
- 检查是否有其他 DO 的货物混装
- 联系调度部门核实

### 货物损坏

- 在差异说明中详细描述损坏情况
- 拍照记录损坏证据
- 按照损坏货物处理流程执行

## 权限要求

- 查看 DO 信息：`warehouse.delivery_order.view`
- 仓库确认：`warehouse.delivery_order.transport`

## 注意事项

1. **确认时机**：只有状态为 `arrived` 的 DO 才能进行仓库确认
2. **数据准确性**：务必仔细核查实际数量，确保录入准确
3. **异常处理**：发现差异时应及时记录并上报
4. **操作记录**：所有确认操作都会详细记录在 DO 日志中

## 相关 API

- GET `/api/warehouse/delivery-order/:id/warehouse-info` - 获取仓库确认信息
- POST `/api/warehouse/delivery-order/:id/warehouse-confirm` - 确认货物数量
- GET `/api/warehouse/delivery-order/:id/logs` - 查看操作日志
- POST `/api/warehouse/delivery-order/:id/complete-delivery` - 完成入库（确认后）
