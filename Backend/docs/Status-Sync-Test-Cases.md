# 状态同步测试用例

## 测试准备

### 创建测试数据

```javascript
// 1. 创建Forecast
const forecast = await Forecast.create({
  forecast_code: "FC2025080301",
  agent_id: 1,
  mawb: "157-12345678",
  status: "in_transit",
});

// 2. 创建Pallets
const pallet1 = await Pallet.create({
  pallet_code: "PLT001",
  forecast_id: forecast.id,
  status: "pending",
  box_count: 25,
});

const pallet2 = await Pallet.create({
  pallet_code: "PLT002",
  forecast_id: forecast.id,
  status: "pending",
  box_count: 25,
});

// 3. 创建Packages
const packages1 = [];
for (let i = 1; i <= 25; i++) {
  const pkg = await Package.create({
    package_code: `PKG001-${i.toString().padStart(3, "0")}`,
    forecast_id: forecast.id,
    pallet_id: pallet1.id,
    client_id: 1,
    status: "arrived",
  });
  packages1.push(pkg);
}

const packages2 = [];
for (let i = 1; i <= 25; i++) {
  const pkg = await Package.create({
    package_code: `PKG002-${i.toString().padStart(3, "0")}`,
    forecast_id: forecast.id,
    pallet_id: pallet2.id,
    client_id: 1,
    status: "arrived",
  });
  packages2.push(pkg);
}
```

## 测试案例

### 案例 1：单 DO 正常入库

```bash
# 1. 创建DO（包含所有板）
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "management_type": "pallet",
    "pallet_ids": [1, 2],
    "driver_name": "张三",
    "driver_id_number": "123456789012345678",
    "vehicle_plate": "京A12345",
    "pickup_location": "地仓A区"
  }'

# 预期结果：
# - Pallet状态: pending → dispatched
# - Package状态: arrived → in_transit
# - Forecast状态: in_transit (不变)

# 2. 确认提货
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/1/pickup" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# 3. 仓库确认（数量正确）
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/1/warehouse-confirm" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actual_pallet_count": 2,
    "actual_package_count": 50,
    "warehouse_receiver": "王小明"
  }'

# 预期结果：
# - DO状态: picked_up → arrived

# 4. 完成入库
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/1/complete-delivery" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse_receiver": "王小明"
  }'

# 预期结果：
# - DO状态: arrived → delivered
# - Pallet状态: dispatched → delivered
# - Package状态: in_transit → delivered
# - Forecast状态: in_transit → completed
```

### 案例 2：单 DO 异常入库

```bash
# 1. 创建DO（同上）
# 2. 确认提货（同上）

# 3. 仓库确认（数量不符）
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/1/warehouse-confirm" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actual_pallet_count": 2,
    "actual_package_count": 45,
    "warehouse_receiver": "王小明",
    "discrepancy_notes": "第二板缺少5个包裹"
  }'

# 预期结果：
# - DO状态: picked_up → incident

# 4. 完成入库（标记丢失包裹）
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/1/complete-delivery" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse_receiver": "王小明",
    "missing_packages": [46, 47, 48, 49, 50]
  }'

# 预期结果：
# - DO状态: incident → delivered
# - Pallet状态: dispatched → incident
# - Package状态: 45个 in_transit → delivered, 5个 in_transit → missing
# - Forecast状态: in_transit → delivered_with_incident
```

### 案例 3：多 DO 部分入库

```bash
# 1. 创建第一个DO（只包含第一板）
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "management_type": "pallet",
    "pallet_ids": [1],
    "driver_name": "张三",
    "driver_id_number": "123456789012345678",
    "vehicle_plate": "京A12345",
    "pickup_location": "地仓A区"
  }'

# 预期结果：
# - Pallet1状态: pending → dispatched
# - Package1状态: arrived → in_transit
# - Pallet2状态: pending (不变)
# - Package2状态: arrived (不变)
# - Forecast状态: in_transit (不变)

# 2. 创建第二个DO（包含第二板）
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "management_type": "pallet",
    "pallet_ids": [2],
    "driver_name": "李四",
    "driver_id_number": "123456789012345679",
    "vehicle_plate": "京B12345",
    "pickup_location": "地仓A区"
  }'

# 预期结果：
# - Pallet2状态: pending → dispatched
# - Package2状态: arrived → in_transit

# 3. 第一个DO提货并入库
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/1/pickup" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

curl -X POST "http://localhost:3000/api/warehouse/delivery-order/1/warehouse-confirm" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actual_pallet_count": 1,
    "actual_package_count": 25,
    "warehouse_receiver": "王小明"
  }'

curl -X POST "http://localhost:3000/api/warehouse/delivery-order/1/complete-delivery" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse_receiver": "王小明"
  }'

# 预期结果：
# - DO1状态: picked_up → arrived → delivered
# - Pallet1状态: dispatched → delivered
# - Package1状态: in_transit → delivered
# - Pallet2状态: dispatched (不变)
# - Package2状态: in_transit (不变)
# - Forecast状态: in_transit → partial_delivered

# 4. 第二个DO提货并入库
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/2/pickup" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

curl -X POST "http://localhost:3000/api/warehouse/delivery-order/2/warehouse-confirm" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actual_pallet_count": 1,
    "actual_package_count": 25,
    "warehouse_receiver": "李小华"
  }'

curl -X POST "http://localhost:3000/api/warehouse/delivery-order/2/complete-delivery" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse_receiver": "李小华"
  }'

# 预期结果：
# - DO2状态: picked_up → arrived → delivered
# - Pallet2状态: dispatched → delivered
# - Package2状态: in_transit → delivered
# - Forecast状态: partial_delivered → completed
```

### 案例 4：多 DO 部分入库有异常

```bash
# 1-2. 创建两个DO（同案例3）

# 3. 第一个DO正常入库（同案例3）
# 预期结果：Forecast状态变为 partial_delivered

# 4. 第二个DO异常入库
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/2/pickup" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

curl -X POST "http://localhost:3000/api/warehouse/delivery-order/2/warehouse-confirm" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actual_pallet_count": 1,
    "actual_package_count": 20,
    "warehouse_receiver": "李小华",
    "discrepancy_notes": "缺少5个包裹"
  }'

curl -X POST "http://localhost:3000/api/warehouse/delivery-order/2/complete-delivery" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse_receiver": "李小华",
    "missing_packages": [46, 47, 48, 49, 50]
  }'

# 预期结果：
# - DO2状态: picked_up → incident → delivered
# - Pallet2状态: dispatched → incident
# - Package2状态: 20个 in_transit → delivered, 5个 in_transit → missing
# - Forecast状态: partial_delivered → delivered_with_incident
```

## 验证查询

### 检查状态同步结果

```bash
# 1. 查看Forecast状态
curl -X GET "http://localhost:3000/api/agent/forecasts/1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. 查看Pallet状态
curl -X GET "http://localhost:3000/api/warehouse/pallets/1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. 查看Package状态
curl -X GET "http://localhost:3000/api/warehouse/packages/1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. 查看DO状态和日志
curl -X GET "http://localhost:3000/api/warehouse/delivery-order/1" \
  -H "Authorization: Bearer YOUR_TOKEN"

curl -X GET "http://localhost:3000/api/warehouse/delivery-order/1/logs" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### SQL 查询验证

```sql
-- 查看Forecast的包裹分布统计
SELECT
  f.id as forecast_id,
  f.forecast_code,
  f.status as forecast_status,
  COUNT(p.id) as total_packages,
  COUNT(CASE WHEN p.status = 'delivered' THEN 1 END) as delivered_packages,
  COUNT(CASE WHEN p.status = 'in_transit' THEN 1 END) as in_transit_packages,
  COUNT(CASE WHEN p.status IN ('incident', 'damaged', 'missing') THEN 1 END) as problem_packages
FROM forecasts f
LEFT JOIN packages p ON f.id = p.forecast_id
WHERE f.id = 1
GROUP BY f.id, f.forecast_code, f.status;

-- 查看Pallet的包裹分布统计
SELECT
  pl.id as pallet_id,
  pl.pallet_code,
  pl.status as pallet_status,
  COUNT(p.id) as total_packages,
  COUNT(CASE WHEN p.status = 'delivered' THEN 1 END) as delivered_packages,
  COUNT(CASE WHEN p.status = 'in_transit' THEN 1 END) as in_transit_packages,
  COUNT(CASE WHEN p.status IN ('incident', 'damaged', 'missing') THEN 1 END) as problem_packages
FROM pallets pl
LEFT JOIN packages p ON pl.id = p.pallet_id
WHERE pl.forecast_id = 1
GROUP BY pl.id, pl.pallet_code, pl.status;

-- 查看DO关联的实体状态
SELECT
  do.id as do_id,
  do.do_number,
  do.status as do_status,
  do.management_type,
  do.warehouse_confirmed,
  do.confirmed_pallet_count,
  do.confirmed_package_count
FROM delivery_orders do
WHERE do.id IN (1, 2);
```

## 预期测试结果汇总

| 测试案例 | 初始状态                                                    | 操作               | 预期 Forecast 状态                          | 预期 Pallet 状态                         | 预期 Package 状态              |
| -------- | ----------------------------------------------------------- | ------------------ | ------------------------------------------- | ---------------------------------------- | ------------------------------ |
| 案例 1   | Forecast: in_transit<br>Pallet: pending<br>Package: arrived | 单 DO 正常入库     | completed                                   | delivered                                | delivered                      |
| 案例 2   | 同案例 1                                                    | 单 DO 异常入库     | delivered_with_incident                     | incident                                 | 45 个 delivered + 5 个 missing |
| 案例 3   | 同案例 1                                                    | 多 DO 部分入库     | partial_delivered → completed               | Pallet1: delivered<br>Pallet2: delivered | 全部 delivered                 |
| 案例 4   | 同案例 1                                                    | 多 DO 部分异常入库 | partial_delivered → delivered_with_incident | Pallet1: delivered<br>Pallet2: incident  | 45 个 delivered + 5 个 missing |

## 注意事项

1. **测试环境准备**：确保数据库为空或使用测试数据库
2. **事务完整性**：每个测试案例应该在独立的数据环境中运行
3. **状态验证**：每次操作后都要验证相关实体的状态变化
4. **日志检查**：查看操作日志确认状态同步的执行情况
