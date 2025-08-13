# TranSync 客户端完整 API 使用指南

## 📋 概述

这是 TranSync 系统客户端的完整 API 接口集合，涵盖了所有客户端功能模块。本指南包含了完整的 Postman 集合和使用说明。

## 🚀 快速开始

### 1. 导入 Postman 集合

1. **导入 API 集合**：

   - 文件：`TranSync_Complete_Client_API.postman_collection.json`
   - 包含：7 个模块，32 个 API 接口

2. **导入环境配置**：
   - 文件：`TranSync_Complete_Client_Environment.postman_environment.json`
   - 包含：所有必需的环境变量

### 2. 配置环境

确保以下环境变量已正确设置：

| 变量名          | 默认值                  | 说明       |
| --------------- | ----------------------- | ---------- |
| `base_url`      | `http://localhost:3000` | 服务器地址 |
| `test_username` | `client001`             | 测试用户名 |
| `test_password` | `password123`           | 测试密码   |

## 📁 API 模块详解

### 01. 用户认证

- **客户登录** - POST `/api/client/login`
- **客户信息** - GET `/api/client/profile`

**特性**：

- 自动保存 Token 到环境变量
- JWT 认证自动管理

### 02. 入站管理

- **创建入站** - POST `/api/client/create-inbond`
- **获取入站列表** - GET `/api/client/inbonds`
- **获取入站详情** - GET `/api/client/inbond/{id}`
- **更新入站信息** - PUT `/api/client/inbond/{id}`

**业务流程**：

1. 创建 draft 状态入站
2. 设置运输方式、清关类型等
3. 添加包裹到入站
4. 提交入站处理

### 03. 预报单管理

- **获取预报单列表** - GET `/api/client/forecasts`
- **获取预报单详情** - GET `/api/client/forecasts/{id}`
- **获取包裹统计信息** - GET `/api/client/forecasts/stats`

**查询功能**：

- 支持按状态、MAWB、航班号筛选
- 分页查询
- 统计信息聚合

### 04. 包裹查询

- **获取所有包裹列表** - GET `/api/client/packages`
- **获取包裹详情** - GET `/api/client/packages/{id}`

**查询特性**：

- 显示客户自己的包裹
- 包含清关、物流等详细信息

### 05. 入站包裹管理 ⭐

- **添加包裹到入站** - POST `/api/client/inbond/{id}/add-package`
- **批量添加包裹到入站** - POST `/api/client/inbond/{id}/add-packages-batch`
- **获取入站包裹列表** - GET `/api/client/inbond/{id}/packages`
- **更新包裹信息** - PUT `/api/client/package/{id}`
- **批量更新包裹** - PUT `/api/client/packages-batch`
- **删除包裹** - DELETE `/api/client/package/{id}`
- **批量删除包裹** - DELETE `/api/client/packages-batch`

**核心功能**：

- 单个/批量包裹操作
- 自动生成包裹代码
- 状态验证和权限控制

### 06. 包裹项目管理 ⭐

- **添加包裹项目** - POST `/api/client/package/{code}/add-item`
- **获取包裹项目列表** - GET `/api/client/package/{code}/items`
- **从 Excel 批量添加项目** - POST `/api/client/inbond/{id}/add-items-from-excel`
- **获取入站所有项目** - GET `/api/client/inbond/{id}/items`

**高级功能**：

- 完整的收发件人信息
- 产品详情和海关编码
- Excel 批量导入支持
- 自动创建缺失包裹

### 07. 系统接口

- **健康检查** - GET `/api/health`
- **获取系统信息** - GET `/api/system/info`

## 🔄 标准业务流程

### 完整包裹管理流程

```
1. 客户登录
   ↓
2. 创建入站
   ↓
3. 添加包裹到入站
   ↓
4. 添加包裹项目详情
   ↓
5. 查看入站所有包裹和项目
   ↓
6. 提交入站处理
```

### 批量导入流程

```
1. 准备Excel数据
   ↓
2. 调用批量导入API
   ↓
3. 系统自动创建包裹（如不存在）
   ↓
4. 验证导入结果
```

## 📊 数据格式说明

### 包裹数据结构

```json
{
  "length_cm": 30, // 长度(厘米)
  "width_cm": 20, // 宽度(厘米)
  "height_cm": 15, // 高度(厘米)
  "weight_kg": 2.5, // 重量(公斤)
  "split_action": "direct", // 分拆动作
  "remark": "备注信息"
}
```

### 包裹项目数据结构

```json
{
  "tracking_no": "追踪号",
  "receiver_name": "收件人姓名",
  "receiver_country": "收件国家",
  "receiver_city": "收件城市",
  "product_name_en": "英文产品名称",
  "total_price": 25.0,
  "hs_code": "海关编码"
  // ... 更多字段
}
```

## ⚡ 自动化功能

### 环境变量自动管理

- **登录后**：自动保存`client_token`
- **创建入站后**：自动保存`inbond_id`和`inbond_code`
- **创建包裹后**：自动保存`package_id`和`package_code`
- **创建项目后**：自动保存`package_item_id`

### 测试脚本

- **全局错误检查**：自动检测 401、403、500 错误
- **响应日志**：自动记录请求和响应信息
- **状态验证**：自动验证 API 响应状态

## 🛡️ 安全和权限

### 认证机制

- JWT Token 认证
- 24 小时 Token 有效期
- 自动 Token 刷新支持

### 权限控制

- 客户只能访问自己的数据
- 状态限制：只能修改 draft 状态的入站
- 批量操作限制：最多 200 个包裹/1000 个项目

## 📈 性能优化建议

### 批量操作

- **包裹操作**：使用批量 API，最多 200 个/批次
- **项目操作**：使用批量 API，最多 1000 个/批次
- **分页查询**：合理设置 limit，推荐 20-50

### 最佳实践

1. **优先使用批量 API**处理多个对象
2. **合理分批**避免超时
3. **错误重试**实现容错机制
4. **状态检查**操作前验证状态

## 🔧 故障排除

### 常见错误

| 错误码 | 原因                       | 解决方法                 |
| ------ | -------------------------- | ------------------------ |
| 400    | 请求参数错误/JSON 格式错误 | 检查 JSON 格式和必需字段 |
| 401    | Token 过期/无效            | 重新登录获取新 Token     |
| 403    | 权限不足                   | 确认操作权限和数据所有权 |
| 404    | 资源不存在                 | 确认 ID 正确且资源存在   |
| 500    | 服务器错误                 | 联系技术支持             |

### ✅ 最新修复

**登录认证问题修复**（2025-08-07）：

- ❌ 旧问题：`/api/client/login` 返回 "Missing token" 错误
- ✅ 已修复：登录路由现在正确地跳过认证中间件
- 📝 技术细节：修改了 `createClientAppRouter` 函数，为客户端登录路由添加条件认证

### 调试技巧

1. **检查 Console 输出**：查看自动化脚本日志
2. **验证环境变量**：确认 Token 和 ID 已正确设置
3. **分步测试**：从简单接口开始逐步测试
4. **查看响应**：仔细检查错误消息
5. **服务器日志**：检查后端控制台输出了解详细错误信息

## 📞 技术支持

### 联系方式

- **技术文档**：参考`INBOUND_PACKAGE_API_GUIDE.md`
- **代码仓库**：TranSync Backend 项目
- **开发团队**：TranSync 开发组

### 更新日志

- **v1.0.0** - 初始版本，包含所有核心功能
- **v1.1.0** - 添加批量操作和 Excel 导入功能
- **v1.2.0** - 完善预报单和包裹查询功能

---

**文档版本**：v1.2.0  
**更新时间**：2025 年 8 月 7 日  
**维护者**：TranSync 开发团队

## 🎯 开始使用

1. **导入 Postman 集合**：`TranSync_Complete_Client_API.postman_collection.json`
2. **导入环境配置**：`TranSync_Complete_Client_Environment.postman_environment.json`
3. **运行"客户登录"**获取 Token
4. **按模块顺序测试**所有功能
5. **参考 API 指南**了解业务流程

现在你拥有了 TranSync 客户端的完整 API 工具包！🚀
