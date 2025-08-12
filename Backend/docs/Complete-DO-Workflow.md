# 完整 DO 业务流程指南

## 业务流程概览

```
1. 仓库创建DO → 2. 司机提货 → 3. 运输(可选) → 4. 仓库确认 → 5. 入库完成
   [pending]      [picked_up]    [in_transit]      [arrived]       [delivered]
                                     ↓               ↓
                                 [incident] ← 数量异常确认
```

## 详细流程步骤

### 步骤 1：仓库创建 DO 单

**操作者**：仓库工作人员  
**状态变化**：无 → `pending` (待提货)

```http
POST /api/warehouse/delivery-order/
```

**请求示例：**

```json
{
  "management_type": "pallet",
  "pallet_ids": [101, 102, 103],
  "driver_name": "张三",
  "driver_id_number": "123456789012345678",
  "vehicle_plate": "京A12345",
  "pickup_location": "洛杉矶地仓A区",
  "pickup_details": "3号库位，共3板货物",
  "remark": "货物状况良好，注意轻拿轻放"
}
```

**响应：**

```json
{
  "message": "DO创建成功",
  "delivery_order": {
    "id": 123,
    "do_number": "DO250803-01",
    "status": "pending",
    "management_type": "pallet"
  }
}
```

---

### 步骤 2：司机地仓提货

**操作者**：司机或仓库人员  
**状态变化**：`pending` → `picked_up` (已提货)

```http
POST /api/warehouse/delivery-order/123/pickup
```

**请求示例：**

```json
{
  "pickup_time": "2025-08-03T10:30:00Z",
  "remark": "货物已全部装车，状况良好"
}
```

**响应：**

```json
{
  "message": "提货成功",
  "do_number": "DO250803-01",
  "status": "picked_up",
  "pickup_time": "2025-08-03T10:30:00Z"
}
```

---

### 步骤 3：运输过程（可选状态变更）

#### 3.1 开始运输（可选）

**操作者**：司机  
**状态变化**：`picked_up` → `in_transit` (运输中)

```http
POST /api/warehouse/delivery-order/123/start-transport
```

**请求示例（最简）：**

```json
{}
```

**请求示例（详细）：**

```json
{
  "departure_time": "2025-08-03T11:00:00Z",
  "departure_location": "洛杉矶地仓",
  "target_warehouse": "总仓库A区",
  "estimated_arrival": "2025-08-03T15:00:00Z",
  "transport_distance": 85.5,
  "remark": "天气良好，路况正常"
}
```

#### 3.2 到达仓库（可选）

**操作者**：司机  
**状态变化**：`in_transit` → `arrived` (已到达)

```http
POST /api/warehouse/delivery-order/123/arrive-warehouse
```

**请求示例：**

```json
{
  "arrival_time": "2025-08-03T15:30:00Z",
  "warehouse_location": "总仓库卸货区",
  "arrival_condition": "正常",
  "remark": "已到达卸货区，等待仓库人员接收"
}
```

---

### 步骤 4：仓库确认（关键步骤）

#### 4.1 查询 DO 确认信息

**操作者**：仓库员工

```http
GET /api/warehouse/delivery-order/123/warehouse-info
```

**响应示例：**

```json
{
  "do_number": "DO250803-01",
  "status": "arrived",
  "management_type": "pallet",
  "expected_quantities": {
    "pallet_count": 3,
    "package_count": 75,
    "total_weight_kg": 1800.5
  },
  "cargo_details": {
    "pallets": [
      {
        "id": 101,
        "pallet_code": "PLT001",
        "custom_board_no": "B001",
        "box_count": 25
      },
      {
        "id": 102,
        "pallet_code": "PLT002",
        "custom_board_no": "B002",
        "box_count": 25
      },
      {
        "id": 103,
        "pallet_code": "PLT003",
        "custom_board_no": "B003",
        "box_count": 25
      }
    ]
  },
  "confirmation_template": {
    "actual_pallet_count": 3,
    "actual_package_count": 75
  }
}
```

#### 4.2 确认货物数量

**操作者**：仓库员工  
**支持状态**：`picked_up`, `in_transit`, `arrived`

```http
POST /api/warehouse/delivery-order/123/warehouse-confirm
```

**数量正确示例：**

```json
{
  "actual_pallet_count": 3,
  "actual_package_count": 75,
  "warehouse_receiver": "王小明",
  "remark": "货物状况良好，与DO单完全一致"
}
```

**响应（正常）：**

```json
{
  "message": "仓库确认完成，货物数量正常",
  "do_number": "DO250803-01",
  "status": "arrived",
  "confirmation_result": {
    "has_discrepancy": false,
    "expected_pallet_count": 3,
    "actual_pallet_count": 3,
    "expected_package_count": 75,
    "actual_package_count": 75,
    "discrepancies": []
  },
  "next_step": "可以继续进行入库操作"
}
```

**数量异常示例：**

```json
{
  "actual_pallet_count": 2,
  "actual_package_count": 50,
  "warehouse_receiver": "李小华",
  "discrepancy_notes": "缺失第3板(PLT003)，共25箱",
  "remark": "建议联系司机核实情况"
}
```

**响应（异常）：**

```json
{
  "message": "仓库确认完成，发现货物差异，已标记为异常",
  "do_number": "DO250803-01",
  "status": "incident",
  "confirmation_result": {
    "has_discrepancy": true,
    "expected_pallet_count": 3,
    "actual_pallet_count": 2,
    "expected_package_count": 75,
    "actual_package_count": 50,
    "discrepancies": [
      {
        "type": "pallet_count",
        "expected": 3,
        "actual": 2,
        "difference": -1,
        "description": "板数不符：预期3板，实际2板"
      },
      {
        "type": "package_count",
        "expected": 75,
        "actual": 50,
        "difference": -25,
        "description": "箱数不符：预期75箱，实际50箱"
      }
    ]
  },
  "next_step": "请联系相关部门处理货物差异问题"
}
```

---

### 步骤 5：入库完成

**操作者**：仓库员工  
**前置条件**：状态为 `arrived` 或 `incident`  
**状态变化**：`arrived/incident` → `delivered` (入库完成)

```http
POST /api/warehouse/delivery-order/123/complete-delivery
```

**请求示例：**

```json
{
  "delivery_time": "2025-08-03T16:00:00Z",
  "warehouse_receiver": "王小明",
  "quality_check_result": "良好",
  "storage_locations": ["A区-1排-3层", "A区-1排-4层"],
  "remark": "货物已全部入库完成"
}
```

**响应：**

```json
{
  "message": "入库完成",
  "do_number": "DO250803-01",
  "status": "delivered",
  "delivery_time": "2025-08-03T16:00:00Z",
  "summary": {
    "total_packages": 75,
    "normal_packages": 75,
    "damaged_packages": 0,
    "missing_packages": 0
  }
}
```

## 灵活性说明

### 状态跳跃支持

系统支持灵活的状态变更：

1. **完整流程**：`pending` → `picked_up` → `in_transit` → `arrived` → `delivered`
2. **简化流程 1**：`pending` → `picked_up` → `arrived` → `delivered`（跳过运输状态）
3. **简化流程 2**：`pending` → `picked_up` → 直接仓库确认 → `arrived/incident` → `delivered`

### 仓库确认灵活性

仓库确认支持从以下状态开始：

- `picked_up`：司机提货后直接到仓库确认
- `in_transit`：运输过程中到达确认
- `arrived`：正常到达后确认

### 异常处理

- 数量正确：状态变为 `arrived`，可以入库
- 数量异常：状态变为 `incident`，需要处理后才能入库
- 异常 DO 也可以强制入库（标记损坏/丢失包裹）

## 权限要求

- 创建 DO：`warehouse.delivery_order.create`
- 提货确认：`warehouse.delivery_order.pickup`
- 运输管理：`warehouse.delivery_order.transport`
- 仓库确认：`warehouse.delivery_order.transport`
- 完成入库：`warehouse.delivery_order.delivery`

## 实际应用场景

### 场景 1：标准流程

适用于长距离运输，需要详细追踪的情况

### 场景 2：本地运输

司机提货后直接到仓库，跳过运输状态，直接确认

### 场景 3：异常处理

货物数量不符时，系统自动标记异常，便于后续处理

这个流程设计既保证了完整性，又提供了充分的灵活性，满足不同的实际业务需求。
