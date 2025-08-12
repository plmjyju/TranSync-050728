# Delivery Order 提货汇总指南

## 概述

当你派出多辆车提取同一个 MAWB 的货物后，需要确认整体的提货完成情况。系统提供了全面的汇总报告功能。

## 1. 单个 MAWB 汇总查询

### API 接口

```
GET /api/warehouse/delivery-orders/mawb-summary/{mawb}?hawb={hawb}
```

### 使用示例

查看 MAWB 157-12345678 的整体提货情况：

```bash
GET /api/warehouse/delivery-orders/mawb-summary/157-12345678
```

### 响应示例

```json
{
  "mawb": "157-12345678",
  "hawb": null,
  "summary": {
    "total_packages": 100, // 总包裹数
    "assigned_packages": 88, // 已分配包裹数
    "picked_up_packages": 42, // 已提取包裹数
    "pending_pickup": 46, // 待提取包裹数
    "unassigned_packages": 12, // 未分配包裹数
    "total_weight_kg": 2500.5, // 总重量
    "picked_weight_kg": 1050.2, // 已提取重量
    "completion_rate": "42.00%" // 完成率
  },
  "delivery_orders": {
    "total_dos": 2, // 总DO数量
    "by_status": {
      "allocated": 0, // 已分配待确认
      "pending": 1, // 待提货
      "picked_up": 1, // 已提货
      "cancelled": 0 // 已取消
    },
    "details": [
      {
        "do_number": "DO250802-01",
        "status": "picked_up",
        "management_type": "package",
        "driver_name": "张三",
        "vehicle_plate": "京A12345",
        "pickup_time": "2025-08-02T10:30:00Z",
        "total_packages": 42,
        "picked_packages": 42,
        "packages": [
          {
            "id": 1,
            "package_code": "PKG001",
            "weight_kg": 25.5,
            "pickup_status": "picked_up",
            "pickup_time": "2025-08-02T10:30:00Z"
          }
          // ... 更多包裹
        ]
      },
      {
        "do_number": "DO250802-02",
        "status": "pending",
        "management_type": "package",
        "driver_name": "李四",
        "vehicle_plate": "京B67890",
        "pickup_time": null,
        "total_packages": 46,
        "picked_packages": 0,
        "packages": [
          // ... 李四车的包裹
        ]
      }
    ]
  },
  "unassigned_packages": [
    {
      "id": 89,
      "package_code": "PKG089",
      "weight_kg": 15.2,
      "status": "arrived",
      "client": {
        "id": 123,
        "username": "client001",
        "company_name": "ABC公司"
      }
    }
    // ... 更多未分配包裹
  ],
  "forecast_info": {
    "id": 1,
    "forecast_code": "FC2025080201",
    "mawb": "157-12345678",
    "flight_no": "CZ3001"
  }
}
```

## 2. 多 MAWB 批量汇总

### 场景应用

- 查看整个航班的提货情况
- 查看多个相关 MAWB 的汇总情况

### API 接口

```
POST /api/warehouse/delivery-orders/batch-mawb-summary
```

### 按 MAWB 列表查询

```json
{
  "mawb_list": ["157-12345678", "157-12345679", "157-12345680"]
}
```

### 按航班号查询

```json
{
  "flight_no": "CZ3001"
}
```

### 响应示例

```json
{
  "query": {
    "flight_no": "CZ3001"
  },
  "overall_summary": {
    "total_mawbs": 3, // 涉及MAWB数量
    "total_packages": 245, // 总包裹数
    "total_assigned": 200, // 总已分配数
    "total_picked_up": 150, // 总已提取数
    "total_unassigned": 45, // 总未分配数
    "total_weight_kg": 6150.8, // 总重量
    "total_picked_weight_kg": 3825.5, // 已提取总重量
    "total_dos": 6, // 涉及DO总数
    "overall_completion_rate": "61.22%" // 整体完成率
  },
  "mawb_summaries": [
    {
      "mawb": "157-12345678",
      "flight_no": "CZ3001",
      "total_packages": 100,
      "assigned_packages": 88,
      "picked_up_packages": 42,
      "unassigned_packages": 12,
      "total_weight_kg": 2500.5,
      "picked_weight_kg": 1050.2,
      "completion_rate": "42.00%",
      "involved_dos": 2,
      "do_statuses": {
        "pending": 1,
        "picked_up": 1
      }
    },
    {
      "mawb": "157-12345679",
      "flight_no": "CZ3001",
      "total_packages": 80,
      "assigned_packages": 80,
      "picked_up_packages": 80,
      "unassigned_packages": 0,
      "total_weight_kg": 2000.3,
      "picked_weight_kg": 2000.3,
      "completion_rate": "100.00%",
      "involved_dos": 2,
      "do_statuses": {
        "picked_up": 2
      }
    }
    // ... 更多MAWB汇总
  ]
}
```

## 3. 实际使用场景

### 场景 1: 检查两辆车的提货完成情况

**问题**: "我派了两辆车去提 MAWB 157-12345678 的货，现在想知道两辆车的情况"

**操作**:

```bash
GET /api/warehouse/delivery-orders/mawb-summary/157-12345678
```

**从响应中可以看到**:

- 张三的车（DO250802-01）：状态为"已提货"，提取了 42 个包裹
- 李四的车（DO250802-02）：状态为"待提货"，还没开始提货
- 还有 12 个包裹未分配给任何车辆
- 整体完成率 42%

### 场景 2: 检查整个航班的提货进度

**问题**: "CZ3001 航班的所有货物提货情况如何？"

**操作**:

```bash
POST /api/warehouse/delivery-orders/batch-mawb-summary
{
  "flight_no": "CZ3001"
}
```

**从响应中可以看到**:

- 航班涉及 3 个 MAWB
- 总共 245 个包裹，已提取 150 个
- 整体完成率 61.22%
- 涉及 6 个 DO

### 场景 3: 查看特定客户的多个 MAWB

**问题**: "ABC 公司的几个 MAWB 提货情况？"

**操作**:

```bash
POST /api/warehouse/delivery-orders/batch-mawb-summary
{
  "mawb_list": ["157-12345678", "157-12345679", "157-12345680"]
}
```

## 4. 关键指标说明

### 包裹状态分类

- **总包裹数**: 该 MAWB 下的所有包裹
- **已分配包裹**: 已分配给 DO 的包裹（但不一定已提取）
- **已提取包裹**: 实际已经提走的包裹
- **待提取包裹**: 已分配但还未提取的包裹
- **未分配包裹**: 还没分配给任何 DO 的包裹

### DO 状态说明

- **allocated**: 已分配待确认（预创建但未分配具体包裹）
- **pending**: 待提货（已分配包裹，等待提取）
- **picked_up**: 已提货（完成提取）
- **cancelled**: 已取消

### 完成率计算

- **单 MAWB 完成率**: 已提取包裹数 / 总包裹数
- **整体完成率**: 所有 MAWB 已提取包裹总数 / 所有 MAWB 包裹总数

## 5. 权限要求

查看汇总报告需要以下权限：

- `warehouse.delivery_order.view` - 查看 DO 和汇总报告

这些汇总接口让你能够全面掌握多车提货的整体完成情况！
