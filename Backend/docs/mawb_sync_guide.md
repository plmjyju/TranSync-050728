# MAWB 同步功能说明

## 功能概述

当货代或运营人员更新预报单(Forecast)的 MAWB 号时，系统会自动同步更新该预报单下所有包裹(Package)的 MAWB 字段，确保数据一致性。

## 支持的更新途径

### 1. 货代端更新 MAWB

**端点**: `PATCH /api/agent/forecasts/:id/mawb`

**请求体:**

```json
{
  "mawb": "784-12345678"
}
```

**响应:**

```json
{
  "message": "✅ MAWB 更新成功，已同步到包裹",
  "mawb": "784-12345678",
  "updated_packages": 5
}
```

### 2. 运营管理平台更新 MAWB

**端点**: `PATCH /api/omp/forecasts/:id/mawb`

**权限**: 运营管理员权限

**请求体:**

```json
{
  "mawb": "784-12345678"
}
```

**响应:**

```json
{
  "message": "✅ 运营管理：MAWB 更新成功，已同步到包裹",
  "mawb": "784-12345678",
  "old_mawb": "784-11111111",
  "updated_packages": 8,
  "forecast_code": "IB0A001-250801A"
}
```

## 同步逻辑

### 自动同步规则

1. **更新范围**: 仅更新属于该预报单的包裹
2. **事务安全**: 使用数据库事务确保数据一致性
3. **日志记录**: 记录操作日志和系统日志
4. **错误处理**: 如果同步失败，整个操作回滚

### 工具函数

系统提供了 `syncMAWBToPackages` 工具函数：

```javascript
import { syncMAWBToPackages } from "../utils/syncMAWBToPackages.js";

// 在事务中使用
const updatedCount = await syncMAWBToPackages(forecastId, newMAWB, transaction);
```

### 数据库操作

实际执行的 SQL 操作：

```sql
UPDATE packages
SET mawb = '784-12345678'
WHERE forecast_id = 1;
```

## 使用场景

### 场景 1: 货代获取到 MAWB 信息

1. 货代登录系统
2. 进入预报单管理页面
3. 点击"编辑 MAWB"
4. 输入新的 MAWB 号
5. 系统自动同步到所有相关包裹

### 场景 2: 运营纠错 MAWB

1. 运营发现 MAWB 号错误
2. 在运营管理平台找到对应预报单
3. 更新正确的 MAWB 号
4. 系统记录操作日志并同步包裹

### 场景 3: 客户端查看包裹

1. 客户登录系统查看自己的包裹
2. 可以看到包裹所在的预报单信息
3. 但无法修改预报单或 MAWB 信息
4. 只能查看属于自己的包裹数据

## 前端集成建议

### MAWB 编辑组件

```javascript
const updateMAWB = async (forecastId, newMAWB) => {
  try {
    const response = await api.patch(`/forecasts/${forecastId}/mawb`, {
      mawb: newMAWB,
    });

    // 显示成功信息
    toast.success(
      `MAWB更新成功，已同步${response.data.updated_packages}个包裹`
    );

    // 刷新预报单和包裹列表
    refreshForecastData();
  } catch (error) {
    toast.error("MAWB更新失败：" + error.message);
  }
};
```

### 确认对话框

```javascript
const confirmMAWBUpdate = (forecastCode, oldMAWB, newMAWB, packageCount) => {
  return confirm(`
    确定要更新预报单 ${forecastCode} 的MAWB吗？
    
    旧MAWB: ${oldMAWB || "未设置"}
    新MAWB: ${newMAWB}
    影响包裹: ${packageCount}个
    
    此操作将同步更新所有相关包裹的MAWB字段。
  `);
};
```

## 权限控制

| 角色             | 权限                    | 说明                                                    |
| ---------------- | ----------------------- | ------------------------------------------------------- |
| 货代 (Agent)     | 可以更新预报单 MAWB     | 可通过 `/api/agent/forecasts/:id/mawb`                  |
| 客户 (Client)    | 只能查看自己的包裹      | 可通过 `/api/client/forecasts` 查看包含自己包裹的预报单 |
| 运营管理员 (OMP) | 可以更新所有预报单 MAWB | 可通过 `/api/omp/forecasts/:id/mawb`                    |
| 仓库 (WMS)       | 只读                    | 不能修改 MAWB                                           |

## 错误处理

### 常见错误情况

1. **预报单不存在**

   ```json
   {
     "message": "预报单不存在"
   }
   ```

2. **无权限修改**

   ```json
   {
     "message": "预报单不存在或无权限修改"
   }
   ```

3. **MAWB 格式错误**

   ```json
   {
     "message": "MAWB格式不正确"
   }
   ```

4. **数据库事务失败**
   ```json
   {
     "message": "服务器错误"
   }
   ```

## 监控和日志

### 系统日志记录

每次 MAWB 更新都会记录：

- 操作用户
- 预报单编号
- 旧 MAWB 和新 MAWB
- 影响的包裹数量
- 操作时间和 IP 地址

### 审计追踪

可通过以下方式查看 MAWB 更新历史：

1. 系统日志表 (`system_logs`)
2. 预报单操作记录
3. 包裹变更历史

这确保了 MAWB 更新的完整可追溯性。
