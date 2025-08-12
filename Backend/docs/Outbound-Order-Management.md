# 出库单管理系统 API 文档

## 概述

出库单管理系统用于处理货物出库流程，支持多 AWB 出库但确保客户一致性和板子状态一致性。包含出库单创建、仓库确认、签名文档上传等完整流程。

## 核心特性

- ✅ 多 AWB 支持（但必须属于同一客户）
- ✅ PalletAllocation 状态一致性验证
- ✅ 出库单号自动生成（OUT + 年月日时分秒 + 随机数）
- ✅ 分阶段出库流程（创建 → 仓库确认 → 正式出库）
- ✅ 签名文档上传验证
- ✅ 完整的操作日志记录
- ✅ 基于角色的权限控制

## API 端点

### 1. 创建出库单

**POST** `/warehouse/outbound/outbound-orders`

**权限要求**: `warehouse.outbound.create`

**请求参数**:

```json
{
  "awb_numbers": ["AWB001", "AWB002"], // 必填：AWB编号列表
  "pickup_contact_person": "张三", // 可选：提货联系人
  "pickup_contact_phone": "13800138000", // 可选：提货联系电话
  "pickup_vehicle_info": "京A12345", // 可选：提货车辆信息
  "notes": "特殊提货要求" // 可选：备注信息
}
```

**验证规则**:

- 所有 AWB 必须属于同一个客户
- 所有相关的 PalletAllocation 状态必须是"stored"（已入库）
- 只有状态为"stored"的包裹才能出库

**响应示例**:

```json
{
  "message": "出库单创建成功",
  "outbound_order": {
    "id": 1,
    "outbound_number": "OUT20250803143025001",
    "client_id": 1,
    "awb_numbers": ["AWB001", "AWB002"],
    "pallet_numbers": ["PLT001", "PLT002"],
    "total_packages": 15,
    "total_weight": "125.500",
    "status": "pending",
    "created_at": "2025-08-03T14:30:25.000Z",
    "client": {
      "id": 1,
      "username": "client001",
      "name": "客户公司A"
    }
  }
}
```

### 2. 获取出库单列表

**GET** `/warehouse/outbound/outbound-orders`

**权限要求**: `warehouse.outbound.view`

**查询参数**:

- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 20）
- `status`: 状态筛选（pending/confirmed/cancelled）
- `client_id`: 客户 ID 筛选
- `outbound_number`: 出库单号模糊搜索
- `awb_number`: AWB 号模糊搜索

**权限控制**:

- 客户（client）只能查看自己的出库单
- 其他角色可以查看所有出库单

### 3. 获取出库单详情

**GET** `/warehouse/outbound/outbound-orders/:id`

**权限要求**: `warehouse.outbound.view`

**响应包含**:

- 出库单基本信息
- 客户信息
- 创建人和确认人信息
- 完整的操作日志

### 4. 仓库确认出库（上传签名文档）

**PATCH** `/warehouse/outbound/outbound-orders/:id/confirm`

**权限要求**: `warehouse.outbound.confirm`

**请求参数**:

```json
{
  "signed_document_url": "https://example.com/signed_doc.jpg", // 必填：签名文档URL
  "notes": "确认出库，客户已签收" // 可选：确认备注
}
```

**自动操作**:

- 更新出库单状态为"confirmed"
- 更新所有相关 PalletAllocation 状态为"shipped"
- 更新所有相关 Package 状态为"shipped"
- 记录确认时间和确认人

### 5. 取消出库单

**PATCH** `/warehouse/outbound/outbound-orders/:id/cancel`

**权限要求**: `warehouse.outbound.cancel`

**限制条件**:

- 只有"pending"状态的出库单才能取消
- 已确认的出库单不能取消

## 数据模型

### OutboundOrder（出库单）

| 字段                  | 类型       | 说明                                |
| --------------------- | ---------- | ----------------------------------- |
| id                    | BIGINT     | 主键 ID                             |
| outbound_number       | STRING(50) | 出库单号（唯一）                    |
| client_id             | BIGINT     | 客户 ID                             |
| awb_numbers           | JSON       | AWB 编号列表                        |
| pallet_numbers        | JSON       | 板号列表                            |
| total_packages        | INTEGER    | 总包裹数量                          |
| total_weight          | DECIMAL    | 总重量（KG）                        |
| status                | ENUM       | 状态（pending/confirmed/cancelled） |
| pickup_contact_person | STRING     | 提货联系人                          |
| pickup_contact_phone  | STRING     | 提货联系电话                        |
| pickup_vehicle_info   | STRING     | 提货车辆信息                        |
| signed_document_url   | STRING     | 签名文档 URL                        |
| notes                 | TEXT       | 备注信息                            |
| created_by            | BIGINT     | 创建人 ID                           |
| confirmed_by          | BIGINT     | 确认人 ID                           |
| confirmed_at          | DATE       | 确认时间                            |

### OutboundOrderLog（出库单日志）

| 字段              | 类型   | 说明       |
| ----------------- | ------ | ---------- |
| id                | BIGINT | 主键 ID    |
| outbound_order_id | BIGINT | 出库单 ID  |
| action            | ENUM   | 操作类型   |
| operator_id       | BIGINT | 操作员 ID  |
| old_value         | JSON   | 操作前的值 |
| new_value         | JSON   | 操作后的值 |
| details           | JSON   | 操作详情   |
| notes             | TEXT   | 操作备注   |

## 状态流转

```
pending（待确认）
    ↓ warehouse.outbound.confirm
confirmed（已确认/正式出库）

pending（待确认）
    ↓ warehouse.outbound.cancel
cancelled（已取消）
```

## 权限系统

| 权限                       | 说明       | 适用角色               |
| -------------------------- | ---------- | ---------------------- |
| warehouse.outbound.view    | 查看出库单 | warehouse, omp, client |
| warehouse.outbound.create  | 创建出库单 | warehouse, omp         |
| warehouse.outbound.edit    | 编辑出库单 | warehouse, omp         |
| warehouse.outbound.confirm | 确认出库   | warehouse              |
| warehouse.outbound.cancel  | 取消出库单 | warehouse, omp         |

## 业务流程

1. **创建出库单**

   - 选择多个 AWB（必须同一客户）
   - 验证所有板子都是已入库状态
   - 自动生成出库单号
   - 计算总包裹数和总重量

2. **仓库处理**

   - 准备货物
   - 客户到场提货
   - 客户签字确认

3. **确认出库**
   - 上传签名文档照片
   - 系统自动更新所有相关状态
   - 完成出库流程

## 注意事项

- 出库单号格式：OUT + YYYYMMDDHHMMSS + 3 位随机数
- 同一出库单的所有 AWB 必须属于同一客户
- 只有已入库（stored）状态的包裹才能出库
- 签名文档是确认出库的必要条件
- 确认出库后会自动更新包裹和板子状态为已出库（shipped）
