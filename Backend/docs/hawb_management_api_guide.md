# HAWB 管理 API 指南

## 概述

HAWB（House Air Waybill，分运单号）是航空运输中每个客户的货物分组标识。在一个预报单中，通常每个客户的包裹都会分配一个独特的 HAWB 号。

## 业务逻辑

### HAWB 分配原则

- **按客户分配**: 同一预报单中，每个客户的所有包裹共享一个 HAWB
- **唯一性**: 每个 HAWB 在系统中应该是唯一的
- **可修改性**: 货代和运营管理员可以修改 HAWB 分配
- **追溯性**: 所有 HAWB 变更都记录操作日志

## 货代端 HAWB 管理

### 1. 为客户分配 HAWB

```http
PATCH /api/agent/forecasts/:id/hawb
```

**权限**: `agent.forecast.edit`

**请求体:**

```json
{
  "client_id": 123,
  "hawb": "HAWB001234"
}
```

**响应:**

```json
{
  "message": "✅ HAWB 分配成功",
  "hawb": "HAWB001234",
  "client_name": "客户A",
  "updated_packages": 5,
  "forecast_code": "IB0A001-250801A"
}
```

### 2. 查看预报单 HAWB 分配情况

```http
GET /api/agent/forecasts/:id/hawb-assignments
```

**权限**: `agent.forecast.view`

**响应:**

```json
{
  "forecast": {
    "id": 1,
    "forecast_code": "IB0A001-250801A",
    "mawb": "784-12345678"
  },
  "hawb_assignments": [
    {
      "client_id": 123,
      "hawb": "HAWB001234",
      "package_count": "5",
      "total_weight": "52.50",
      "client": {
        "id": 123,
        "username": "客户A",
        "company_name": "公司A"
      }
    },
    {
      "client_id": 124,
      "hawb": "HAWB001235",
      "package_count": "3",
      "total_weight": "28.30",
      "client": {
        "id": 124,
        "username": "客户B",
        "company_name": "公司B"
      }
    }
  ]
}
```

### 3. 批量分配 HAWB

```http
POST /api/agent/forecasts/:id/batch-hawb
```

**权限**: `agent.forecast.edit`

**请求体:**

```json
{
  "assignments": [
    {
      "client_id": 123,
      "hawb": "HAWB001234"
    },
    {
      "client_id": 124,
      "hawb": "HAWB001235"
    },
    {
      "client_id": 125,
      "hawb": "HAWB001236"
    }
  ]
}
```

**响应:**

```json
{
  "message": "✅ 批量HAWB分配完成",
  "forecast_code": "IB0A001-250801A",
  "results": [
    {
      "client_id": 123,
      "client_name": "客户A",
      "hawb": "HAWB001234",
      "updated_packages": 5
    },
    {
      "client_id": 124,
      "client_name": "客户B",
      "hawb": "HAWB001235",
      "updated_packages": 3
    }
  ]
}
```

## 运营管理端 HAWB 管理

### 1. 运营更新客户 HAWB

```http
PATCH /api/omp/forecasts/:id/hawb
```

**权限**: `omp.forecast.edit`

**请求体:**

```json
{
  "client_id": 123,
  "hawb": "HAWB999999"
}
```

**响应:**

```json
{
  "message": "✅ 运营管理：HAWB 分配成功",
  "hawb": "HAWB999999",
  "old_hawb": "HAWB001234",
  "client_name": "客户A",
  "updated_packages": 5,
  "forecast_code": "IB0A001-250801A"
}
```

### 2. 运营查看 HAWB 分配情况

```http
GET /api/omp/forecasts/:id/hawb-assignments
```

**权限**: `omp.forecast.view`

**响应:**

```json
{
  "forecast": {
    "id": 1,
    "forecast_code": "IB0A001-250801A",
    "mawb": "784-12345678",
    "status": "confirmed",
    "creator": {
      "username": "货代A",
      "company_name": "物流公司"
    }
  },
  "hawb_assignments": [
    {
      "client_id": 123,
      "hawb": "HAWB999999",
      "package_count": "5",
      "total_weight": "52.50",
      "client": {
        "id": 123,
        "username": "客户A",
        "company_name": "公司A",
        "email": "client@example.com"
      }
    }
  ]
}
```

### 3. 运营批量分配 HAWB

```http
POST /api/omp/forecasts/:id/batch-hawb
```

**权限**: `omp.forecast.edit`

**请求体:**

```json
{
  "assignments": [
    {
      "client_id": 123,
      "hawb": "HAWB888888"
    },
    {
      "client_id": 124,
      "hawb": "HAWB888889"
    }
  ]
}
```

**响应:**

```json
{
  "message": "✅ 运营管理：批量HAWB分配完成",
  "forecast_code": "IB0A001-250801A",
  "total_clients": 2,
  "total_packages": 8,
  "results": [
    {
      "client_id": 123,
      "client_name": "客户A",
      "old_hawb": "HAWB999999",
      "new_hawb": "HAWB888888",
      "updated_packages": 5
    },
    {
      "client_id": 124,
      "client_name": "客户B",
      "old_hawb": "HAWB001235",
      "new_hawb": "HAWB888889",
      "updated_packages": 3
    }
  ]
}
```

### 4. 全局 HAWB 统计

```http
GET /api/omp/hawb/global-stats
```

**权限**: `omp.statistics.view`

**响应:**

```json
{
  "hawb_stats": [
    {
      "hawb": "HAWB888888",
      "package_count": "15",
      "total_weight": "150.75",
      "forecast_count": "3",
      "client_count": "1"
    },
    {
      "hawb": "HAWB888889",
      "package_count": "12",
      "total_weight": "125.30",
      "forecast_count": "2",
      "client_count": "1"
    }
  ],
  "total": {
    "total_hawbs": "25",
    "total_packages_with_hawb": "150"
  }
}
```

## 数据结构说明

### Package 表字段更新

```sql
-- HAWB字段已添加到Package表
hawb VARCHAR(50) NULL COMMENT '分运单号(House Air Waybill)'
```

### HAWB 分配逻辑

```sql
-- 更新指定客户在指定预报单中的所有包裹HAWB
UPDATE packages
SET hawb = 'HAWB001234'
WHERE forecast_id = 1 AND client_id = 123;
```

## 权限控制

### 货代权限

- ✅ 可以为自己创建的预报单分配 HAWB
- ✅ 可以查看自己预报单的 HAWB 分配情况
- ❌ 无法操作其他货代的预报单

### 运营管理权限

- ✅ 可以为任意预报单分配 HAWB
- ✅ 可以查看所有预报单的 HAWB 分配情况
- ✅ 可以查看全局 HAWB 统计数据
- ✅ 所有操作都记录详细的审计日志

### 客户端权限

- ✅ 可以查看自己包裹的 HAWB 信息
- ❌ 无法修改 HAWB 分配

## 审计日志

### 操作记录

所有 HAWB 相关操作都会记录到 `system_logs` 表：

```json
{
  "user_id": 1,
  "action": "update_hawb",
  "target_type": "forecast",
  "target_id": 1,
  "description": "运营管理：更新预报单IB0A001-250801A中客户张三的HAWB从HAWB001234到HAWB999999，影响5个包裹",
  "metadata": {
    "client_id": 123,
    "old_hawb": "HAWB001234",
    "new_hawb": "HAWB999999",
    "updated_packages": 5
  },
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0..."
}
```

## 前端集成示例

### HAWB 分配组件

```javascript
const HAWBManager = ({ forecastId, isOMP = false }) => {
  const [assignments, setAssignments] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [newHAWB, setNewHAWB] = useState("");

  const assignHAWB = async (clientId, hawb) => {
    try {
      const endpoint = isOMP
        ? `/omp/forecasts/${forecastId}/hawb`
        : `/agent/forecasts/${forecastId}/hawb`;
      const response = await api.patch(endpoint, {
        client_id: clientId,
        hawb: hawb,
      });

      toast.success(
        `HAWB分配成功：${response.data.updated_packages}个包裹已更新`
      );
      refreshAssignments();
    } catch (error) {
      toast.error("HAWB分配失败：" + error.message);
    }
  };

  const batchAssignHAWB = async (assignments) => {
    try {
      const endpoint = isOMP
        ? `/omp/forecasts/${forecastId}/batch-hawb`
        : `/agent/forecasts/${forecastId}/batch-hawb`;
      const response = await api.post(endpoint, { assignments });

      toast.success(
        `批量分配成功：${response.data.total_packages}个包裹已更新`
      );
      refreshAssignments();
    } catch (error) {
      toast.error("批量分配失败：" + error.message);
    }
  };

  return (
    <div className="hawb-manager">
      <h3>HAWB分运单号管理</h3>

      {/* 当前分配情况 */}
      <div className="current-assignments">
        {assignments.map((assignment) => (
          <div key={assignment.client_id} className="assignment-item">
            <span>{assignment.client.username}</span>
            <span>HAWB: {assignment.hawb || "未分配"}</span>
            <span>{assignment.package_count}个包裹</span>
            <button onClick={() => editHAWB(assignment)}>编辑</button>
          </div>
        ))}
      </div>

      {/* 分配表单 */}
      <div className="assign-form">
        <select value={selectedClient} onChange={setSelectedClient}>
          <option>选择客户</option>
          {/* 客户选项 */}
        </select>
        <input value={newHAWB} onChange={setNewHAWB} placeholder="输入HAWB号" />
        <button onClick={() => assignHAWB(selectedClient, newHAWB)}>
          分配HAWB
        </button>
      </div>
    </div>
  );
};
```

### 错误处理

```javascript
const handleHAWBError = (error) => {
  switch (error.response?.status) {
    case 404:
      if (error.response.data.message.includes("客户")) {
        toast.error("客户不存在或无包裹");
      } else {
        toast.error("预报单不存在");
      }
      break;
    case 403:
      toast.error("无权限操作此预报单");
      break;
    default:
      toast.error("操作失败，请稍后重试");
  }
};
```

这套 HAWB 管理系统提供了：

- 🏷️ **按客户分配**: 每个客户在预报单中有独立的 HAWB
- 🔄 **批量操作**: 支持一次性为多个客户分配 HAWB
- 👁️ **可视化管理**: 清晰显示 HAWB 分配情况
- 📋 **完整审计**: 所有 HAWB 变更都有详细记录
- 🛡️ **权限控制**: 不同角色有不同的操作权限
