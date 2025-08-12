# Pallet API 使用指南

## 基础路径

所有 Pallet API 的基础路径为：`/api/warehouse/pallets`

## 权限要求

- 需要用户认证（Bearer Token）
- 需要相应的仓库管理权限

## API 接口列表

### 1. 获取板列表

```http
GET /api/warehouse/pallets
```

**查询参数:**

- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 20)
- `status`: 状态筛选 (pending|stored|waiting_clear|unpacked|dispatched|returned)
- `location_code`: 位置筛选
- `forecast_id`: 预报单 ID 筛选
- `is_unpacked`: 是否已拆板 (true|false)
- `search`: 搜索关键词（板号、类型、位置）

**响应示例:**

```json
{
  "pallets": [
    {
      "id": 1,
      "pallet_code": "PMC001",
      "forecast_id": 1,
      "pallet_type": "PMC",
      "status": "stored",
      "location_code": "A1-B2-C3",
      "is_unpacked": false,
      "weight_kg": "500.75",
      "box_count": 10,
      "forecast": {
        "forecast_code": "FC001",
        "mawb": "784-12345678"
      },
      "packages": [
        {
          "id": 1,
          "package_code": "PKG001",
          "status": "arrived"
        }
      ]
    }
  ],
  "pagination": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "pages": 3
  }
}
```

### 2. 创建航空板

```http
POST /api/warehouse/pallets
```

**请求体:**

```json
{
  "pallet_code": "PMC001",
  "forecast_id": 1,
  "pallet_type": "PMC",
  "length_cm": 318,
  "width_cm": 224,
  "height_cm": 162,
  "weight_kg": 500.75,
  "location_code": "A1-B2-C3",
  "remark": "新建航空板"
}
```

### 3. 更新板信息

```http
PUT /api/warehouse/pallets/:id
```

**请求体:**

```json
{
  "pallet_type": "LD3",
  "weight_kg": 600.5,
  "location_code": "A2-B3-C4",
  "remark": "更新板信息"
}
```

### 4. 板入仓

```http
POST /api/warehouse/pallets/:id/inbound
```

**请求体:**

```json
{
  "location_code": "A1-B2-C3"
}
```

**功能:**

- 将板状态从 `pending` 更新为 `stored`
- 记录入仓时间 `inbound_time`
- 设置仓库位置
- 自动记录操作日志

### 5. 拆板操作

```http
POST /api/warehouse/pallets/:id/unpack
```

**请求体:**

```json
{
  "remark": "海关查验需要拆板"
}
```

**功能:**

- 设置 `is_unpacked = true`
- 状态更新为 `unpacked`
- 包裹可单独管理和移动

### 6. 板出库

```http
POST /api/warehouse/pallets/:id/dispatch
```

**请求体:**

```json
{
  "is_full_board": true,
  "remark": "整板出库给客户"
}
```

**功能:**

- 状态更新为 `dispatched`
- 标记是否整板出库
- 记录出库方式

### 7. 板归还

```http
POST /api/warehouse/pallets/:id/return
```

**请求体:**

```json
{
  "remark": "空板归还航空公司"
}
```

**功能:**

- 状态更新为 `returned`
- 记录归还时间 `returned_time`
- 完成板的生命周期

### 8. 获取板操作日志

```http
GET /api/warehouse/pallets/:id/logs
```

**查询参数:**

- `page`: 页码
- `limit`: 每页数量

**响应示例:**

```json
{
  "logs": [
    {
      "id": 5,
      "action": "returned",
      "old_status": "dispatched",
      "new_status": "returned",
      "description": "板归还操作",
      "operator": "张三",
      "created_at": "2025-07-31T10:30:00Z"
    },
    {
      "id": 4,
      "action": "dispatched",
      "old_status": "unpacked",
      "new_status": "dispatched",
      "description": "板出库，拆包出库",
      "operator": "李四",
      "created_at": "2025-07-31T09:15:00Z"
    }
  ]
}
```

### 9. 获取板状态统计

```http
GET /api/warehouse/pallets/statistics
```

**响应示例:**

```json
{
  "statusStats": [
    { "status": "stored", "count": 15 },
    { "status": "unpacked", "count": 8 },
    { "status": "dispatched", "count": 5 },
    { "status": "returned", "count": 2 }
  ],
  "unpackedStats": [
    { "is_unpacked": false, "count": 20 },
    { "is_unpacked": true, "count": 10 }
  ]
}
```

## 业务流程示例

### 典型的航空板生命周期:

1. **创建板**

   ```bash
   POST /api/warehouse/pallets
   # 状态: pending
   ```

2. **板入仓**

   ```bash
   POST /api/warehouse/pallets/1/inbound
   # 状态: pending → stored
   ```

3. **拆板（如需要）**

   ```bash
   POST /api/warehouse/pallets/1/unpack
   # 状态: stored → unpacked
   # is_unpacked: true
   ```

4. **板出库**

   ```bash
   POST /api/warehouse/pallets/1/dispatch
   # 状态: → dispatched
   ```

5. **板归还**
   ```bash
   POST /api/warehouse/pallets/1/return
   # 状态: → returned
   # 设置 returned_time
   ```

## 错误处理

所有 API 都会返回标准的错误格式：

```json
{
  "error": "错误描述信息"
}
```

常见错误状态码：

- `400`: 请求参数错误或业务逻辑错误
- `401`: 未认证
- `403`: 权限不足
- `404`: 资源不存在
- `500`: 服务器内部错误

## 注意事项

1. **状态转换限制**: 某些状态转换有限制，如只有 `pending` 状态的板才能执行入仓操作
2. **权限控制**: 不同操作需要不同权限，确保用户拥有相应权限
3. **事务安全**: 所有状态变更都在数据库事务中执行，保证数据一致性
4. **日志记录**: 所有操作都会自动记录详细日志，便于追踪和审计
5. **关联关系**: 删除预报单时会级联删除相关板和日志
