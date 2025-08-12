# 多车提货策略 - 解决方案指南

## 场景描述

一个 MAWB 有 100 个包裹，需要派两辆车提货，但事先不知道地仓会给哪些具体包裹给哪辆车。

## 完整操作流程

### 第一步：调度阶段 - 创建多车灵活提货 DO

当你知道需要派两辆车去提 MAWB 157-12345678 的 100 个包裹，但不知道具体如何分配时：

```json
POST /api/warehouse/delivery-orders/create-flexible
{
  "mawb": "157-12345678",
  "vehicle_count": 2,
  "vehicles": [
    {
      "driver_name": "张三",
      "driver_id_number": "123456789",
      "vehicle_plate": "京A12345",
      "estimated_capacity": 50
    },
    {
      "driver_name": "李四",
      "driver_id_number": "987654321",
      "vehicle_plate": "京B67890",
      "estimated_capacity": 50
    }
  ],
  "pickup_location": "A区-01",
  "remark": "MAWB 157-12345678 双车提货"
}
```

**系统响应**：

```json
{
  "message": "多车提货DO创建成功，已为2辆车预创建DO",
  "mawb": "157-12345678",
  "total_available_packages": 100,
  "delivery_orders": [
    {
      "id": 123,
      "do_number": "DO250802-01",
      "vehicle_index": 0,
      "driver_name": "张三",
      "vehicle_plate": "京A12345"
    },
    {
      "id": 124,
      "do_number": "DO250802-02",
      "vehicle_index": 1,
      "driver_name": "李四",
      "vehicle_plate": "京B67890"
    }
  ],
  "next_step": "现场分配包裹后，使用allocate-packages接口确定每车的具体包裹"
}
```

此时两个 DO 的状态都是 `"allocated"`（已分配待确认），包裹被预留但未分配具体车辆。

### 第二步：现场阶段 - 分配具体包裹

当两辆车到达地仓，地仓工作人员告诉你：

- 张三的车拿包裹 ID: 1-42（42 个包裹）
- 李四的车拿包裹 ID: 43-88（46 个包裹）

使用分配接口：

```json
POST /api/warehouse/delivery-orders/allocate-packages
{
  "mawb": "157-12345678",
  "allocations": [
    {
      "do_id": 123,
      "package_ids": [1, 2, 3, ..., 42]  // 张三车的42个包裹
    },
    {
      "do_id": 124,
      "package_ids": [43, 44, 45, ..., 88]  // 李四车的46个包裹
    }
  ]
}
```

**系统响应**：

```json
{
  "message": "包裹分配成功",
  "mawb": "157-12345678",
  "total_allocated_packages": 88,
  "allocations": [
    {
      "do_number": "DO250802-01",
      "driver_name": "张三",
      "vehicle_plate": "京A12345",
      "allocated_packages": 42
    },
    {
      "do_number": "DO250802-02",
      "driver_name": "李四",
      "vehicle_plate": "京B67890",
      "allocated_packages": 46
    }
  ],
  "next_step": "各车辆现在可以独立进行提货操作"
}
```

分配完成后，两个 DO 的状态从 `"allocated"` 变为 `"pending"`，可以正常提货。

### 第三步：提货阶段 - 各车独立提货

#### 张三提货（完整提货）

```json
POST /api/warehouse/delivery-orders/123/pickup
{
  "remark": "张三车辆完整提货"
}
```

#### 李四提货（假如只提了 30 个包裹）

```json
POST /api/warehouse/delivery-orders/124/partial-pickup-packages
{
  "picked_package_ids": [43, 44, ..., 72],  // 30个包裹
  "remark": "李四车辆容量限制，只提了30个包裹"
}
```

系统会更新李四的 DO：已提取 30/46 个包裹，状态仍为`"pending"`。

#### 后续李四再次提货

```json
POST /api/warehouse/delivery-orders/124/partial-pickup-packages
{
  "picked_package_ids": [73, 74, ..., 88],  // 剩余16个包裹
  "remark": "李四第二次提货，提取剩余包裹"
}
```

当所有 46 个包裹都提取完毕时，DO 状态自动变为`"picked_up"`。

## 应对现场变化的灵活调整

### 场景 1：现场发现包裹分配不合适

如果现场发现张三的车能装更多，李四的车装不下，可以重新分配：

```json
POST /api/warehouse/delivery-orders/batch-reallocate
{
  "mawb": "157-12345678",
  "reallocations": [
    {
      "do_id": 123,
      "package_ids": [1, 2, 3, ..., 60]  // 张三改为60个包裹
    },
    {
      "do_id": 124,
      "package_ids": [61, 62, ..., 88]   // 李四改为28个包裹
    }
  ]
}
```

### 场景 2：发现有包裹漏分配

如果发现还有包裹 ID 89-100 没有分配给任何车，可以补充分配：

```json
POST /api/warehouse/delivery-orders/allocate-packages
{
  "mawb": "157-12345678",
  "allocations": [
    {
      "do_id": 123,
      "package_ids": [89, 90, ..., 100]  // 把剩余包裹给张三
    }
  ]
}
```

## 核心优势

1. **预创建策略**：事先创建 DO，避免现场等待
2. **灵活分配**：现场根据实际情况分配包裹
3. **独立提货**：每辆车可以独立进行提货操作
4. **实时调整**：支持现场重新分配
5. **完整追踪**：每个操作都有详细日志记录

## 状态流转

```
调度阶段: 无 -> allocated (已分配待确认)
现场分配: allocated -> pending (待提货)
提货完成: pending -> picked_up (已提货)
```

这个解决方案完美解决了你提到的问题：不需要事先知道地仓会给哪些包裹，系统支持现场灵活分配和调整！
