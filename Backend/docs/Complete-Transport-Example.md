# 司机提货到仓库完整操作示例

## 场景描述

张三司机已经从地仓提货完成，现在需要将货物运输到仓库并完成入库。

## 完整操作流程演示

### 第一步：提货完成后，开始运输

**时间**: 2025-08-02 14:30，司机准备离开地仓

```bash
POST /api/warehouse/delivery-orders/123/start-transport
{
  "departure_time": "2025-08-02T14:30:00Z",
  "departure_location": "首都机场货运站A区-01",
  "estimated_arrival": "2025-08-02T16:00:00Z",
  "target_warehouse": "公司主仓库B区",
  "driver_contact": "13800138001",
  "vehicle_condition": "正常",
  "cargo_condition": "完好",
  "transport_distance": 45.5,
  "remark": "42个包裹已装车完毕，预计1.5小时到达"
}
```

**系统响应**:

```json
{
  "message": "运输开始记录成功",
  "do_number": "DO250802-01",
  "status": "in_transit",
  "departure_time": "2025-08-02T14:30:00Z",
  "estimated_arrival": "2025-08-02T16:00:00Z",
  "target_warehouse": "公司主仓库B区"
}
```

**状态变化**: DO 状态从 `picked_up` → `in_transit`

### 第二步：运输途中（可选步骤）

#### 2.1 位置更新（15:15，途中位置更新）

```bash
POST /api/warehouse/delivery-orders/123/update-location
{
  "current_location": "京承高速30KM处",
  "latitude": 40.0123,
  "longitude": 116.4567,
  "update_time": "2025-08-02T15:15:00Z",
  "estimated_arrival": "2025-08-02T16:05:00Z",
  "transport_status": "on_schedule",
  "remark": "运输顺利，预计按时到达"
}
```

#### 2.2 异常情况处理（如果发生）

如果途中遇到交通堵塞：

```bash
POST /api/warehouse/delivery-orders/123/report-incident
{
  "incident_type": "traffic_jam",
  "description": "高速公路严重堵车",
  "location": "京承高速35KM处",
  "severity": "medium",
  "estimated_delay": 30,
  "action_taken": "已找到绕行路线，预计延误30分钟"
}
```

### 第三步：到达仓库确认

**时间**: 2025-08-02 16:05，司机到达仓库

```bash
POST /api/warehouse/delivery-orders/123/arrive-warehouse
{
  "arrival_time": "2025-08-02T16:05:00Z",
  "warehouse_location": "公司主仓库B区3号门",
  "arrival_condition": "normal",
  "vehicle_mileage": 47.2,
  "driver_signature": "张三",
  "warehouse_receiver": "仓管员李四",
  "actual_distance": 47.2,
  "remark": "准时到达，货物状态良好，准备卸货"
}
```

**系统响应**:

```json
{
  "message": "到达仓库确认成功",
  "do_number": "DO250802-01",
  "status": "arrived",
  "arrival_time": "2025-08-02T16:05:00Z",
  "warehouse_location": "公司主仓库B区3号门",
  "next_step": "等待卸货检查"
}
```

**状态变化**: DO 状态从 `in_transit` → `arrived`

### 第四步：卸货检查（仓库工作人员操作）

**时间**: 2025-08-02 16:10-16:45，仓库工作人员进行卸货检查

假设检查发现：

- 40 个包裹状态完好
- 2 个包裹有轻微损坏但内容物完好

仓库工作人员记录检查结果（这一步可以通过详细的卸货检查 API 实现，此处简化）

### 第五步：完成入库

**时间**: 2025-08-02 17:00，完成入库上架

```bash
POST /api/warehouse/delivery-orders/123/complete-delivery
{
  "delivery_time": "2025-08-02T17:00:00Z",
  "warehouse_receiver": "仓管员李四",
  "quality_check_result": "良好",
  "storage_locations": [
    "B-01-A-15",
    "B-01-A-16",
    "B-01-A-17"
  ],
  "damaged_packages": [25, 37],  // 包裹ID 25和37有轻微损坏
  "missing_packages": [],
  "remark": "入库完成，2个包裹有轻微包装损坏已单独处理"
}
```

**系统响应**:

```json
{
  "message": "入库完成",
  "do_number": "DO250802-01",
  "status": "delivered",
  "delivery_time": "2025-08-02T17:00:00Z",
  "summary": {
    "total_packages": 42,
    "normal_packages": 40,
    "damaged_packages": 2,
    "missing_packages": 0
  }
}
```

**状态变化**:

- DO 状态：`arrived` → `delivered`
- 包裹状态：
  - 40 个包裹：`arrived` → `stored`
  - 2 个包裹：`arrived` → `damaged`

## 实时跟踪效果

### 1. DO 状态完整流转

```
pending (待提货)
  ↓ [提货]
picked_up (已提货)
  ↓ [开始运输]
in_transit (运输中)
  ↓ [到达仓库]
arrived (已到达)
  ↓ [完成入库]
delivered (已交付)
```

### 2. 时间节点记录

- 提货时间：2025-08-02 14:00
- 离开地仓：2025-08-02 14:30
- 到达仓库：2025-08-02 16:05
- 入库完成：2025-08-02 17:00
- **总耗时**：3 小时

### 3. 运输统计

- 预计距离：45.5KM
- 实际距离：47.2KM
- 预计时间：1.5 小时
- 实际时间：1 小时 35 分钟
- **准时率**：95%

### 4. 质量统计

- 总包裹：42 个
- 完好包裹：40 个（95.2%）
- 损坏包裹：2 个（4.8%）
- 丢失包裹：0 个
- **完好率**：95.2%

## 查看完整记录

可以通过以下方式查看完整的运输和入库记录：

### 查看 DO 详情

```bash
GET /api/warehouse/delivery-orders/123
```

### 查看操作日志

```bash
GET /api/warehouse/delivery-orders/123/logs
```

### 查看 MAWB 汇总

```bash
GET /api/warehouse/delivery-orders/mawb-summary/157-12345678
```

这样就完成了从地仓提货到仓库入库的完整流程，每个环节都有详细记录和状态跟踪！
