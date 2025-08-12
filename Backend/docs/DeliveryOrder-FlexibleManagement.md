# Delivery Order 灵活管理指南

## 双模式管理系统

系统支持两种管理模式：

- **按板管理 (pallet)**: 以板为单位进行提货管理
- **按包裹管理 (package)**: 以包裹为单位进行提货管理

## 按包裹管理的新功能

### 创建按包裹管理的 DO

```json
POST /api/warehouse/delivery-orders
{
  "management_type": "package",
  "package_ids": [包裹ID数组],
  "driver_name": "张三",
  "driver_id_number": "123456789",
  "vehicle_plate": "京A12345",
  "pickup_location": "A区-01"
}
```

### 按包裹部分提货

```json
POST /api/warehouse/delivery-orders/:id/partial-pickup-packages
{
  "picked_package_ids": [实际提取的包裹ID数组],
  "remark": "司机只提取了60个包裹，还有40个未提取"
}
```

## 处理各种异常情况的解决方案

### 1. 装不满的情况

**问题**: 司机觉得车还能装更多板/包裹，想要增加

**按板管理解决方案**:

- **API**: `PATCH /api/warehouse/delivery-orders/:id/pallets`
- **参数**:
  ```json
  {
    "add_pallet_ids": [板ID数组],
    "remark": "车辆容量充足，增加板"
  }
  ```

**按包裹管理解决方案**:

- 修改 DO，添加更多同 MAWB/HAWB 的包裹

### 2. 装不下的情况

**问题**: 车辆容量不足，无法装载所有板/包裹

**按板管理解决方案**:

- **API**: `PATCH /api/warehouse/delivery-orders/:id/pallets`
- **参数**:
  ```json
  {
    "remove_pallet_ids": [要移除的板ID数组],
    "remark": "车辆容量不足，移除部分板"
  }
  ```

**按包裹管理解决方案**:

- 移除部分包裹，可在系统中重新分配

### 3. 拿漏了的情况

#### 按板管理 - 部分提货

- **API**: `POST /api/warehouse/delivery-orders/:id/partial-pickup`
- **参数**:
  ```json
  {
    "picked_pallet_ids": [实际提取的板ID数组],
    "remark": "司机只提取了部分板"
  }
  ```

#### 按包裹管理 - 部分提货（推荐）

- **API**: `POST /api/warehouse/delivery-orders/:id/partial-pickup-packages`
- **参数**:
  ```json
  {
    "picked_package_ids": [实际提取的包裹ID数组],
    "remark": "提取了60个包裹，还有40个未提取"
  }
  ```
- **效果**:
  - DO 状态保持"pending"直到所有包裹都被提取
  - 实时更新提取进度：60/100 已提取
  - 支持多次部分提货

## 操作流程示例

### 场景 1: 按 MAWB 创建包裹 DO

```bash
# 1. 查看可用包裹（按MAWB/HAWB分组）
GET /api/warehouse/delivery-orders/available-packages?mawb=157-12345678

# 2. 创建按包裹管理的DO
POST /api/warehouse/delivery-orders
{
  "management_type": "package",
  "package_ids": [101, 102, 103, ..., 200],  # 100个包裹
  "driver_name": "张三",
  "driver_id_number": "123456789",
  "vehicle_plate": "京A12345",
  "pickup_location": "A区-01"
}
```

### 场景 2: 司机只能拿 60 个包裹

```bash
# 执行部分提货
POST /api/warehouse/delivery-orders/123/partial-pickup-packages
{
  "picked_package_ids": [101, 102, ..., 160],  # 60个包裹ID
  "remark": "车辆容量限制，只能提取60个包裹"
}

# 响应示例:
{
  "message": "部分包裹提货成功",
  "do_number": "DO250802-01",
  "picked_package_count": 60,
  "total_picked": 60,
  "total_packages": 100,
  "remaining_packages": 40,
  "status": "pending"
}
```

### 场景 3: 后续提取剩余包裹

```bash
# 继续提取剩余包裹
POST /api/warehouse/delivery-orders/123/partial-pickup-packages
{
  "picked_package_ids": [161, 162, ..., 200],  # 剩余40个包裹ID
  "remark": "提取剩余包裹"
}

# 当所有包裹都被提取后，DO状态自动变为"picked_up"
```

## API 接口总览

### 新增接口

- `GET /api/warehouse/delivery-orders/available-packages` - 获取可用包裹（按 MAWB/HAWB 分组）
- `POST /api/warehouse/delivery-orders/:id/partial-pickup-packages` - 按包裹部分提货

### 增强接口

- `POST /api/warehouse/delivery-orders` - 支持按板或按包裹创建 DO
- `GET /api/warehouse/delivery-orders` - 列表支持两种管理模式
- `GET /api/warehouse/delivery-orders/:id` - 详情支持两种管理模式

## 数据模型

### DeliveryOrder 新增字段

```sql
management_type ENUM('pallet', 'package') DEFAULT 'pallet'
total_package_count INT DEFAULT 0
picked_package_count INT DEFAULT 0
```

### 新增表

- **delivery_order_packages**: DO 与 Package 的关联表
  - pickup_status: 包裹提货状态
  - pickup_time: 包裹提货时间

## 系统优势

1. **双模式支持**: 灵活应对不同业务场景
2. **精确统计**: 实时跟踪提货进度（如：60/100 已提取）
3. **多次提货**: 支持分批次提取包裹
4. **完整日志**: 记录每次提货操作的详细信息
5. **状态管理**: 自动更新 DO 和包裹状态

## 注意事项

- 按包裹管理时，包裹必须已装板且所属预报单在途
- 部分提货不会创建新 DO，而是在原 DO 中累计提取进度
- 当所有包裹都被提取时，DO 状态自动变为"已提货"
- 支持按 MAWB/HAWB 号快速筛选相关包裹
