# TranSync 客户端入站包裹管理 API 指南

## 📦 概述

本文档详细介绍 TranSync 系统中客户端入站包裹管理的完整 API 接口，包括包裹的创建、更新、删除和项目管理功能。

## 🚀 API 接口清单

### 04. 入站包裹管理

#### 4.1 添加包裹到入站

```http
POST /api/client/inbond/{inbondId}/add-package
```

**功能**: 向指定入站添加单个包裹  
**权限**: 需要客户端认证  
**限制**: 只能向 draft 状态的入站添加包裹

**请求参数**:

```json
{
  "length_cm": 30, // 长度(厘米)
  "width_cm": 20, // 宽度(厘米)
  "height_cm": 15, // 高度(厘米)
  "weight_kg": 2.5, // 重量(公斤)
  "split_action": "direct", // 分拆动作
  "remark": "测试包裹" // 备注
}
```

**响应示例**:

```json
{
  "message": "Package added successfully",
  "package": {
    "id": 123,
    "package_code": "INB001-001",
    "length_cm": 30,
    "width_cm": 20,
    "height_cm": 15,
    "weight_kg": 2.5,
    "split_action": "direct",
    "status": "prepared",
    "tax_type_id": 1,
    "remark": "测试包裹",
    "created_at": "2025-08-07T02:00:00.000Z"
  }
}
```

#### 4.2 批量添加包裹到入站

```http
POST /api/client/inbond/{inbondId}/add-packages-batch
```

**功能**: 批量向入站添加多个包裹  
**限制**: 最多 200 个包裹每批次

**请求参数**:

```json
{
  "packages": [
    {
      "length_cm": 30,
      "width_cm": 20,
      "height_cm": 15,
      "weight_kg": 2.5,
      "split_action": "direct",
      "remark": "测试包裹1"
    },
    {
      "length_cm": 25,
      "width_cm": 25,
      "height_cm": 20,
      "weight_kg": 3.0,
      "split_action": "direct",
      "remark": "测试包裹2"
    }
  ]
}
```

#### 4.3 获取入站包裹列表

```http
GET /api/client/inbond/{inbondId}/packages
```

**功能**: 获取指定入站的所有包裹列表

#### 4.4 更新包裹信息

```http
PUT /api/client/package/{packageId}
```

**功能**: 更新指定包裹的信息  
**限制**: 仅限 prepared 状态的包裹，且入站状态为 draft

#### 4.5 批量更新包裹

```http
PUT /api/client/packages-batch
```

**功能**: 批量更新多个包裹信息  
**限制**: 最多 200 个包裹每批次

#### 4.6 删除包裹

```http
DELETE /api/client/package/{packageId}
```

**功能**: 删除指定包裹  
**限制**: 仅限 prepared 状态的包裹

#### 4.7 批量删除包裹

```http
DELETE /api/client/packages-batch
```

**功能**: 批量删除多个包裹

### 05. 包裹项目管理

#### 5.1 添加包裹项目

```http
POST /api/client/package/{packageCode}/add-item
```

**功能**: 向指定包裹添加项目详情

**请求参数**:

```json
{
  "tracking_no": "TRK123456789",
  "client_code": "CLI001",
  "file_number": "FILE001",

  // 收件人信息
  "receiver_name": "张三",
  "receiver_country": "中国",
  "receiver_state": "广东省",
  "receiver_city": "深圳市",
  "receiver_postcode": "518000",
  "receiver_email": "zhang@example.com",
  "receiver_phone": "13800138000",
  "receiver_address1": "南山区科技园",
  "receiver_address2": "",

  // 发件人信息
  "sender_name": "发送者",
  "sender_country": "美国",
  "sender_province": "加利福尼亚州",
  "sender_city": "洛杉矶",
  "sender_postcode": "90210",
  "sender_address1": "123 Main St",
  "sender_license": "LICENSE123",
  "sender_email": "sender@example.com",
  "sender_phone": "+1234567890",

  // 物理属性
  "weight_kg": 1.5,
  "quantity": 1,
  "length_cm": 20,
  "width_cm": 15,
  "height_cm": 10,

  // 产品信息
  "hs_code": "8471301000",
  "product_name_en": "Computer Accessories",
  "product_description": "USB Cable",
  "origin_country": "中国",
  "url": "https://example.com/product",

  // 价格信息
  "unit_price": 25.0,
  "total_price": 25.0,
  "item_count": 1,

  // 其他属性
  "is_fda": false,
  "manufacturer_mid": "MFG123",
  "custom_note": "特殊说明"
}
```

#### 5.2 获取包裹项目列表

```http
GET /api/client/package/{packageCode}/items
```

**功能**: 获取指定包裹的所有项目列表

#### 5.3 从 Excel 批量添加项目

```http
POST /api/client/inbond/{inbondId}/add-items-from-excel
```

**功能**: 从 Excel 批量导入项目到入站  
**限制**: 最多 1000 个项目每批次  
**特性**: 自动创建不存在的包裹

**请求参数**:

```json
{
  "items": [
    {
      "package_id": 1,
      "tracking_no": "TRK123456789",
      "client_code": "CLI001",
      "receiver_name": "张三",
      "receiver_country": "中国",
      "receiver_city": "深圳市",
      "product_name_en": "Computer Accessories",
      "total_price": 25.0
    }
  ]
}
```

#### 5.4 获取入站所有项目

```http
GET /api/client/inbond/{inbondId}/items
```

**功能**: 获取入站的所有包裹项目（按包裹分组）

## 🔄 业务流程

### 标准包裹创建流程

1. **创建入站** (如果还没有)
2. **添加包裹** → `POST /inbond/{inbondId}/add-package`
3. **添加项目** → `POST /package/{packageCode}/add-item`
4. **查看结果** → `GET /inbond/{inbondId}/items`

### 批量导入流程

1. **准备 Excel 数据** (包含 package_id 和项目详情)
2. **批量导入** → `POST /inbond/{inbondId}/add-items-from-excel`
3. **系统自动创建缺失的包裹**
4. **验证结果** → `GET /inbond/{inbondId}/items`

## 📊 数据验证规则

### 包裹数据

- `length_cm`, `width_cm`, `height_cm`: 数字类型，默认 0
- `weight_kg`: 数字类型，默认 0
- `split_action`: 字符串，默认"direct"
- `remark`: 可选字符串

### 项目数据

- `tracking_no`: 必需，追踪号
- `receiver_name`: 必需，收件人姓名
- `product_name_en`: 必需，英文产品名称
- `total_price`: 必需，总价格
- 其他字段均为可选

## ⚠️ 重要限制

### 状态限制

- 只能向**draft 状态**的入站添加包裹
- 只能修改**prepared 状态**的包裹
- 入站提交后无法修改包裹信息

### 数量限制

- 批量包裹操作：最多 200 个每批次
- 批量项目操作：最多 1000 个每批次
- 单个入站包裹数量：无限制

### 权限限制

- 客户端只能操作自己的入站和包裹
- 无法访问其他客户的数据
- 需要有效的 JWT token 认证

## 🔍 错误处理

### 常见错误代码

| 状态码 | 错误原因         | 解决方法                 |
| ------ | ---------------- | ------------------------ |
| 400    | 请求参数错误     | 检查 JSON 格式和必需字段 |
| 401    | 未认证           | 重新登录获取 token       |
| 403    | 权限不足         | 确认操作权限             |
| 404    | 入站或包裹不存在 | 确认 ID 是否正确         |
| 500    | 服务器错误       | 联系技术支持             |

### 业务错误

- "Inbond not found or cannot be modified": 入站不存在或状态不允许修改
- "Package not found or cannot be modified": 包裹不存在或状态不允许修改
- "Maximum X packages allowed per batch": 超出批量操作限制

## 📝 使用示例

### 示例 1: 创建包裹并添加项目

```javascript
// 1. 添加包裹
const packageResponse = await fetch("/api/client/inbond/1/add-package", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    length_cm: 30,
    width_cm: 20,
    height_cm: 15,
    weight_kg: 2.5,
    remark: "测试包裹",
  }),
});

const packageData = await packageResponse.json();
const packageCode = packageData.package.package_code;

// 2. 添加项目
const itemResponse = await fetch(
  `/api/client/package/${packageCode}/add-item`,
  {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tracking_no: "TRK123456789",
      receiver_name: "张三",
      receiver_country: "中国",
      product_name_en: "Computer Accessories",
      total_price: 25.0,
    }),
  }
);
```

### 示例 2: 批量操作

```javascript
// 批量添加包裹
const batchResponse = await fetch("/api/client/inbond/1/add-packages-batch", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    packages: [
      { length_cm: 30, width_cm: 20, height_cm: 15, weight_kg: 2.5 },
      { length_cm: 25, width_cm: 25, height_cm: 20, weight_kg: 3.0 },
    ],
  }),
});
```

## 🎯 最佳实践

### 性能优化

1. **使用批量操作**: 对于多个包裹或项目，优先使用批量 API
2. **合理分批**: 批量操作时控制每批次数量，避免超时
3. **异步处理**: 大量数据时使用异步处理

### 数据完整性

1. **验证输入**: 客户端验证必需字段后再提交
2. **错误重试**: 实现合理的重试机制
3. **状态检查**: 操作前检查入站和包裹状态

### 用户体验

1. **进度反馈**: 批量操作时显示进度
2. **错误提示**: 提供清晰的错误信息
3. **数据预览**: 导入前预览数据格式

---

**文档版本**: v1.1.0  
**更新时间**: 2025 年 8 月 7 日  
**维护者**: TranSync 开发团队
