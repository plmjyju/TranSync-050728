# DO 操作快速指南

## 核心流程

### 1️⃣ 仓库创建 DO

```bash
# 创建DO
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "management_type": "pallet",
    "pallet_ids": [101, 102, 103],
    "driver_name": "张三",
    "driver_id_number": "123456789012345678",
    "vehicle_plate": "京A12345",
    "pickup_location": "地仓A区"
  }'
```

### 2️⃣ 司机提货

```bash
# 确认提货
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/123/pickup" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_time": "2025-08-03T10:30:00Z",
    "remark": "货物已装车"
  }'
```

### 3️⃣ 运输状态（可选）

```bash
# 开始运输（可选，所有字段可选）
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/123/start-transport" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# 或填写详细信息
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/123/start-transport" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "departure_location": "地仓",
    "target_warehouse": "总仓库"
  }'

# 到达仓库（可选）
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/123/arrive-warehouse" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse_location": "总仓库卸货区"
  }'
```

### 4️⃣ 仓库确认（关键）

```bash
# 查看DO信息
curl -X GET "http://localhost:3000/api/warehouse/delivery-order/123/warehouse-info" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 确认数量
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/123/warehouse-confirm" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actual_pallet_count": 3,
    "actual_package_count": 75,
    "warehouse_receiver": "王小明"
  }'
```

### 5️⃣ 完成入库

```bash
# 完成入库
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/123/complete-delivery" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse_receiver": "王小明",
    "remark": "入库完成"
  }'
```

## 状态流转

```
创建 → 提货 → (运输) → 确认 → 入库
[pending] → [picked_up] → [in_transit] → [arrived] → [delivered]
                            ↓            ↓
                         可选状态     确认可从此开始
```

## 重要说明

### ✅ 灵活性

- **运输状态可选**：可以跳过 `start-transport` 和 `arrive-warehouse`
- **仓库确认支持**：可从 `picked_up`、`in_transit`、`arrived` 状态开始确认
- **字段可选**：运输相关字段都是可选的

### ⚠️ 关键点

- **仓库确认必需**：这是唯一必须的验证步骤
- **数量验证**：系统自动比对实际 vs 预期数量
- **异常处理**：数量不符自动标记为 `incident` 状态

### 🔧 实际使用场景

#### 场景 1：完整流程（长途运输）

```
创建DO → 提货 → 开始运输 → 到达仓库 → 仓库确认 → 入库
```

#### 场景 2：简化流程（本地运输）

```
创建DO → 提货 → 仓库确认 → 入库
```

#### 场景 3：最简流程（司机直接到仓库）

```
创建DO → 提货 → 仓库确认 → 入库
```

### 📋 操作检查清单

#### 仓库人员（创建 DO）

- [ ] 选择正确的管理模式（pallet/package）
- [ ] 核实司机和车辆信息
- [ ] 确认提货地点和货物信息

#### 司机（提货运输）

- [ ] 确认提货（必需）
- [ ] 记录运输信息（可选）
- [ ] 通知仓库到达

#### 仓库人员（确认入库）

- [ ] 根据 DO 号查询货物信息
- [ ] 实地清点板数和箱数
- [ ] 填写实际数量进行确认
- [ ] 处理异常（如有）
- [ ] 完成入库操作

### 🚨 异常处理

#### 数量不符时

1. 系统自动标记为 `incident`
2. 记录详细差异信息
3. 需要联系相关部门处理
4. 处理完成后可继续入库

#### 常见异常

- 板数不足：可能在运输中丢失
- 箱数不符：可能包装破损或散货
- 货物损坏：需要质量检查

### 📞 联系方式

如有问题，请联系：

- 技术支持：内部 IT 部门
- 业务咨询：仓库主管
- 异常处理：物流调度中心
