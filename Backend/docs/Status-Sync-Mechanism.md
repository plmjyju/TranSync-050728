# DO 状态同步机制文档

## 概述

当 DO 单创建和入库时，系统会自动同步相关的 Forecast、Pallet 和 Package 状态，确保数据一致性。

## 状态定义

### Forecast 状态

- `draft` - 草稿
- `booked` - 已预订
- `in_transit` - 运输中
- `arrived` - 已到达
- `cleared` - 已清关
- `completed` - 已入仓（全部完成）
- `partial_delivered` - 部分入仓，部分在途
- `partial_incident` - 部分入仓，部分异常，部分在途
- `delivered_with_incident` - 已部分入仓，有异常

### Pallet 状态

- `pending` - 待入仓
- `stored` - 已入仓
- `waiting_clear` - 等待出清
- `unpacked` - 已拆板
- `dispatched` - 已出库/运输中
- `returned` - 空板已归还
- `delivered` - 已入仓完成
- `incident` - 异常状态

### Package 状态

- `prepared` - 已准备
- `arrived` - 已到达
- `sorted` - 已分拣
- `cleared` - 已清关
- `stored` - 已入库
- `damaged` - 损坏
- `missing` - 丢失
- `delivered` - 已交付/已入仓完成
- `in_transit` - 运输中
- `incident` - 异常状态

## 同步逻辑

### 1. DO 创建时状态同步

当仓库创建 DO 单时，系统会自动更新相关状态：

#### 板管理模式 (Pallet Mode)

```javascript
// 1. 更新Pallet状态
Pallet: pending → dispatched

// 2. 更新板上所有Package状态
Package: 当前状态 → in_transit

// 3. 检查并更新Forecast状态
Forecast: 根据包裹分布情况决定
```

#### 包裹管理模式 (Package Mode)

```javascript
// 1. 直接更新Package状态
Package: 当前状态 → in_transit

// 2. 检查并更新相关Forecast状态
Forecast: 根据包裹分布情况决定
```

### 2. DO 入库时状态同步

当 DO 完成入库时，系统会根据不同情况同步状态：

#### 情况 1：单个 Forecast，单个 DO，数量正确

```javascript
// 更新状态
Pallet: dispatched → delivered
Package: in_transit → delivered
Forecast: in_transit → completed
```

#### 情况 2：单个 Forecast，单个 DO，数量不符

```javascript
// 更新状态
Pallet: dispatched → incident
Package: in_transit → incident/damaged/missing
Forecast: in_transit → delivered_with_incident
```

#### 情况 3：单个 Forecast，多个 DO，部分 DO 入库，数量正确

```javascript
// 已入库DO的相关实体
Pallet: dispatched → delivered
Package: in_transit → delivered

// 未入库DO的相关实体保持不变
Pallet: dispatched (不变)
Package: in_transit (不变)

// Forecast状态
Forecast: in_transit → partial_delivered
```

#### 情况 4：单个 Forecast，多个 DO，部分 DO 入库，数量不符

```javascript
// 已入库DO的相关实体
Pallet: dispatched → incident
Package: in_transit → incident/damaged/missing

// 未入库DO的相关实体保持不变
Pallet: dispatched (不变)
Package: in_transit (不变)

// Forecast状态
Forecast: in_transit → partial_incident
```

## 状态判断逻辑

### Forecast 状态判断

系统通过统计 Forecast 下所有 Package 的状态来决定 Forecast 的状态：

```javascript
const statusCounts = {
  delivered: 0, // 已入仓
  incident: 0, // 异常
  damaged: 0, // 损坏
  missing: 0, // 丢失
  in_transit: 0, // 运输中
  other: 0, // 其他状态
};

const totalPackages = allPackages.length;
const deliveredPackages = statusCounts.delivered;
const problemPackages =
  statusCounts.incident + statusCounts.damaged + statusCounts.missing;
const inTransitPackages = statusCounts.in_transit;
const completedPackages = deliveredPackages + problemPackages;

// 判断逻辑
if (completedPackages === totalPackages) {
  // 所有包裹都已完成
  if (problemPackages > 0) {
    return "delivered_with_incident"; // 已部分入仓，有异常
  } else {
    return "completed"; // 已入仓
  }
} else if (completedPackages > 0) {
  // 部分包裹已完成
  if (problemPackages > 0) {
    return "partial_incident"; // 部分入仓，部分异常，部分在途
  } else {
    return "partial_delivered"; // 部分入仓，部分在途
  }
} else {
  // 没有包裹完成
  return inTransitPackages > 0 ? "in_transit" : null;
}
```

### Pallet 状态判断

Pallet 的状态基于其上所有 Package 的状态：

```javascript
// 统计该板上包裹的完成情况
const palletCompletedPackages = palletPackages.filter((pkg) =>
  ["delivered", "incident", "damaged", "missing"].includes(pkg.status)
).length;

if (palletCompletedPackages === palletPackages.length) {
  // 该板上的所有包裹都已完成
  const hasProblems = palletPackages.some((pkg) =>
    ["incident", "damaged", "missing"].includes(pkg.status)
  );

  return hasProblems ? "incident" : "delivered";
}
```

## 实际案例

### 案例 1：正常单 DO 入库

```
初始状态：
- Forecast FC001: in_transit
- Pallet PLT001: dispatched
- Packages (50个): in_transit

DO入库后（数量正确）：
- Forecast FC001: completed
- Pallet PLT001: delivered
- Packages (50个): delivered
```

### 案例 2：异常单 DO 入库

```
初始状态：
- Forecast FC001: in_transit
- Pallet PLT001: dispatched
- Packages (50个): in_transit

DO入库后（缺少5个包裹）：
- Forecast FC001: delivered_with_incident
- Pallet PLT001: incident
- Packages (45个): delivered
- Packages (5个): missing
```

### 案例 3：多 DO 部分入库

```
初始状态：
- Forecast FC001: in_transit
- Pallet PLT001,PLT002: dispatched
- Packages (100个): in_transit

第一个DO入库后（PLT001，50个包裹）：
- Forecast FC001: partial_delivered
- Pallet PLT001: delivered
- Packages (50个): delivered
- Pallet PLT002: dispatched (不变)
- Packages (50个): in_transit (不变)
```

### 案例 4：多 DO 部分入库有异常

```
初始状态：
- Forecast FC001: in_transit
- Pallet PLT001,PLT002: dispatched
- Packages (100个): in_transit

第一个DO入库后（PLT001，缺少5个包裹）：
- Forecast FC001: partial_incident
- Pallet PLT001: incident
- Packages (45个): delivered
- Packages (5个): missing
- Pallet PLT002: dispatched (不变)
- Packages (50个): in_transit (不变)
```

## API 集成

### DO 创建时自动同步

```javascript
// 在DO创建成功后自动调用
await syncStatusOnDOCreation(deliveryOrder.id, transaction);
```

### DO 入库时自动同步

```javascript
// 在DO入库完成后自动调用
await syncStatusOnDODelivery(
  deliveryOrderId,
  {
    warehouse_receiver,
    damaged_packages,
    missing_packages,
  },
  transaction
);
```

## 监控和日志

所有状态同步操作都会记录详细日志：

```javascript
console.log(`DO ${deliveryOrder.do_number} 创建时状态同步完成`);
console.log(`预报单 ${forecastId} 状态更新为: ${newStatus}`);
console.log(`DO ${deliveryOrder.do_number} 入库时状态同步完成`);
```

## 注意事项

1. **事务安全**：所有状态同步操作都在数据库事务中执行，确保数据一致性
2. **性能考虑**：状态同步会增加数据库操作，但确保了数据准确性
3. **错误处理**：如果状态同步失败，整个操作会回滚
4. **幂等性**：重复执行状态同步不会产生副作用

## 扩展性

系统设计支持未来添加更多状态和同步规则：

- 可以轻松添加新的状态类型
- 同步逻辑模块化，易于维护
- 支持自定义状态判断规则
