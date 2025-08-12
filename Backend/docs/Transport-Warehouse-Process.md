# 司机提货到仓库完整流程指南

## 概述

司机从地仓提货后，需要将货物运输到自己的仓库进行入库。系统需要支持：

1. 运输过程跟踪
2. 到达仓库确认
3. 卸货检查
4. 入库上架
5. 异常处理

## 完整流程设计

### 第一阶段：提货完成 → 运输中

#### 1. 司机确认提货离开地仓

```json
POST /api/warehouse/delivery-orders/{id}/start-transport
{
  "departure_time": "2025-08-02T14:30:00Z",
  "departure_location": "A区-01地仓",
  "estimated_arrival": "2025-08-02T16:00:00Z",
  "target_warehouse": "主仓库-B区",
  "driver_contact": "13800138001",
  "vehicle_condition": "正常",
  "cargo_condition": "完好",
  "remark": "货物已装车完毕，开始运输"
}
```

**系统操作**:

- DO 状态: `picked_up` → `in_transit`（运输中）
- 记录运输开始信息
- 生成运输跟踪号

### 第二阶段：运输途中跟踪

#### 2. 位置跟踪（可选）

```json
POST /api/warehouse/delivery-orders/{id}/update-location
{
  "current_location": "高速公路收费站",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "update_time": "2025-08-02T15:15:00Z",
  "estimated_arrival": "2025-08-02T16:10:00Z",
  "status": "on_schedule" // on_schedule, delayed, emergency
}
```

#### 3. 异常报告

```json
POST /api/warehouse/delivery-orders/{id}/report-incident
{
  "incident_type": "vehicle_breakdown", // vehicle_breakdown, traffic_jam, weather, accident
  "description": "车辆故障，正在等待救援",
  "location": "京沪高速120KM处",
  "severity": "medium", // low, medium, high
  "estimated_delay": 120, // 延误分钟数
  "action_taken": "已联系救援，预计2小时内解决"
}
```

### 第三阶段：到达仓库 → 卸货检查

#### 4. 到达仓库确认

```json
POST /api/warehouse/delivery-orders/{id}/arrive-warehouse
{
  "arrival_time": "2025-08-02T16:05:00Z",
  "warehouse_location": "主仓库-B区-3号门",
  "arrival_condition": "normal", // normal, damaged, partial_loss
  "vehicle_mileage": 85.2,
  "driver_signature": "张三",
  "warehouse_receiver": "李四",
  "remark": "按时到达，货物状态良好"
}
```

**系统操作**:

- DO 状态: `in_transit` → `arrived`（已到达）
- 通知仓库工作人员准备卸货

#### 5. 卸货检查

```json
POST /api/warehouse/delivery-orders/{id}/unloading-check
{
  "unloading_start": "2025-08-02T16:10:00Z",
  "checker_name": "王五",
  "checker_id": 456,
  "package_checks": [
    {
      "package_id": 1,
      "package_code": "PKG001",
      "condition": "good", // good, damaged, missing, excess
      "weight_actual": 25.5,
      "weight_expected": 25.0,
      "damage_description": null,
      "photos": []
    },
    {
      "package_id": 2,
      "package_code": "PKG002",
      "condition": "damaged",
      "weight_actual": 18.2,
      "weight_expected": 20.0,
      "damage_description": "包装破损，内容物完好",
      "photos": ["damage_photo_1.jpg"]
    }
  ],
  "overall_condition": "mostly_good",
  "discrepancies": [
    {
      "type": "weight_difference",
      "description": "PKG002重量不符",
      "expected": 20.0,
      "actual": 18.2
    }
  ],
  "unloading_completed": "2025-08-02T16:45:00Z"
}
```

### 第四阶段：入库上架

#### 6. 分配仓位

```json
POST /api/warehouse/packages/{id}/assign-location
{
  "warehouse_zone": "B区",
  "storage_location": "B-01-A-15",
  "location_type": "shelf", // shelf, floor, bulk
  "assigned_by": "仓管员003",
  "assignment_time": "2025-08-02T16:50:00Z",
  "storage_notes": "易碎品，上层存放"
}
```

#### 7. 上架确认

```json
POST /api/warehouse/packages/batch-shelving
{
  "packages": [
    {
      "package_id": 1,
      "storage_location": "B-01-A-15",
      "shelving_time": "2025-08-02T17:00:00Z",
      "operator": "张三",
      "condition": "good"
    },
    {
      "package_id": 2,
      "storage_location": "B-01-A-16",
      "shelving_time": "2025-08-02T17:02:00Z",
      "operator": "张三",
      "condition": "damaged",
      "special_handling": "damage_report_filed"
    }
  ],
  "batch_completed": "2025-08-02T17:05:00Z"
}
```

**系统操作**:

- Package 状态: `arrived` → `stored`（已入库）
- DO 状态: `arrived` → `delivered`（已交付）

## 状态流转图

```
提货阶段:    pending → picked_up
运输阶段:    picked_up → in_transit → arrived
入库阶段:    arrived → delivered
异常处理:    任意状态 → incident → 恢复原状态
```

## 包裹状态流转

```
地仓状态:    arrived (在地仓)
提货状态:    picked_up (已提货)
运输状态:    in_transit (运输中)
到达状态:    warehouse_arrived (到达仓库)
入库状态:    stored (已入库)
异常状态:    damaged/missing (损坏/丢失)
```

## 关键监控点

### 1. 时效监控

- 提货时间 vs 计划时间
- 运输时间 vs 预估时间
- 入库时间 vs 到达时间

### 2. 质量监控

- 包裹完好率
- 重量差异率
- 损坏包裹处理

### 3. 异常预警

- 运输延误超过 30 分钟
- 包裹损坏率超过 5%
- 司机失联超过 2 小时

## 报表统计

### 日常报表

- 提货完成率
- 运输准时率
- 入库及时率
- 货损率统计

### 司机绩效

- 准时提货率
- 运输安全记录
- 客户满意度

### 仓库效率

- 卸货处理时间
- 入库上架效率
- 异常处理时间

## 移动端支持

### 司机端功能

- 扫码确认提货
- 实时位置上报
- 异常情况报告
- 到达仓库签到

### 仓管端功能

- 到货通知接收
- 卸货检查录入
- 仓位分配管理
- 上架操作确认

这个完整流程确保了从地仓到仓库的全程可控、可追溯！
