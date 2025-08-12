# 包裹操作需求管理系统

## 概述

包裹操作需求管理系统允许客户在分板时为包裹添加特殊的操作要求，并由 OMP 管理员管理这些操作需求选项。系统支持多种类型的操作需求，包括搬运要求、存储要求、运输要求、温度要求、安全要求等。

## 功能特性

### 1. 操作需求选项管理 (OMP)

- ✅ 创建、编辑、删除操作需求选项
- ✅ 启用/停用操作需求选项
- ✅ 批量排序管理
- ✅ 分类管理（搬运、存储、运输、温度、安全、特殊、其他）
- ✅ 优先级管理（低、中、高、紧急）
- ✅ 图标和颜色配置

### 2. 包裹操作需求关联 (客户端)

- ✅ 为包裹添加操作需求
- ✅ 移除包裹操作需求
- ✅ 查看包裹的操作需求
- ✅ 添加额外说明和优先级覆盖

### 3. 操作需求执行管理 (仓库)

- ✅ 查看包裹的操作需求
- ✅ 更新操作需求执行状态
- ✅ 记录完成时间和操作员
- ✅ 添加执行备注

## 数据模型

### OperationRequirement (操作需求选项)

```javascript
{
  id: BIGINT,                    // 主键
  requirement_code: STRING(20),  // 需求代码 (如: FRAGILE, UPRIGHT)
  requirement_name: STRING(100), // 需求名称 (中文)
  requirement_name_en: STRING(100), // 需求名称 (英文)
  description: TEXT,             // 详细描述
  category: ENUM,                // 分类
  priority_level: ENUM,          // 优先级
  icon_class: STRING(50),        // 图标CSS类
  color_code: STRING(10),        // 颜色代码
  is_active: BOOLEAN,            // 是否启用
  sort_order: INTEGER,           // 排序
  created_by: BIGINT,            // 创建人
  updated_by: BIGINT             // 更新人
}
```

### PackageOperationRequirement (包裹操作需求关联)

```javascript
{
  id: BIGINT,                    // 主键
  package_id: BIGINT,            // 包裹ID
  operation_requirement_id: BIGINT, // 操作需求ID
  additional_notes: TEXT,        // 额外说明
  priority_override: ENUM,       // 优先级覆盖
  status: ENUM,                  // 执行状态
  created_by: BIGINT,            // 创建人
  fulfilled_at: DATE,            // 完成时间
  fulfilled_by: BIGINT,          // 完成人
  fulfillment_notes: TEXT        // 完成备注
}
```

## API 接口

### OMP 管理接口

#### 1. 获取操作需求选项

```http
GET /api/omp/operation-requirements
```

**查询参数:**

- `category`: 分类筛选
- `is_active`: 状态筛选
- `priority_level`: 优先级筛选
- `search`: 搜索关键词
- `page`: 页码
- `limit`: 每页数量

#### 2. 创建操作需求

```http
POST /api/omp/operation-requirements
```

**请求体:**

```json
{
  "requirement_code": "FRAGILE",
  "requirement_name": "易碎物品",
  "requirement_name_en": "Fragile Items",
  "description": "包裹含有易碎物品，需要小心搬运",
  "category": "handling",
  "priority_level": "high",
  "icon_class": "fas fa-exclamation-triangle",
  "color_code": "#ff6b6b",
  "sort_order": 1
}
```

#### 3. 更新操作需求

```http
PUT /api/omp/operation-requirements/:requirement_id
```

#### 4. 删除操作需求

```http
DELETE /api/omp/operation-requirements/:requirement_id
```

#### 5. 启用/停用操作需求

```http
PATCH /api/omp/operation-requirements/:requirement_id/toggle-status
```

#### 6. 批量排序

```http
PATCH /api/omp/operation-requirements/batch-sort
```

**请求体:**

```json
{
  "requirements": [
    { "id": 1, "sort_order": 1 },
    { "id": 2, "sort_order": 2 }
  ]
}
```

### 通用接口

#### 1. 获取可用操作需求选项

```http
GET /api/common/operation-requirements/available
```

**查询参数:**

- `category`: 分类筛选
- `search`: 搜索关键词

#### 2. 为包裹添加操作需求

```http
POST /api/common/packages/:package_id/operation-requirements
```

**请求体:**

```json
{
  "operation_requirement_ids": [1, 2, 3],
  "additional_notes": "特殊说明",
  "priority_override": "critical"
}
```

#### 3. 获取包裹的操作需求

```http
GET /api/common/packages/:package_id/operation-requirements
```

#### 4. 移除包裹操作需求

```http
DELETE /api/common/packages/:package_id/operation-requirements/:requirement_id
```

#### 5. 更新操作需求执行状态

```http
PATCH /api/common/packages/:package_id/operation-requirements/:requirement_id/status
```

**请求体:**

```json
{
  "status": "completed",
  "fulfillment_notes": "已按要求完成操作"
}
```

## 默认操作需求选项

系统提供以下 15 个默认操作需求选项：

### 搬运要求

1. **FRAGILE** - 易碎物品
2. **UPRIGHT** - 保持直立
3. **HEAVY** - 重物

### 温度要求

4. **COLD_CHAIN** - 冷链运输 (2-8℃)
5. **FROZEN** - 冷冻保存 (-18℃ 以下)

### 存储要求

6. **DRY** - 防潮保存

### 安全要求

7. **SECURITY** - 安全监控
8. **ID_CHECK** - 身份核验

### 特殊要求

9. **HAZMAT** - 危险品
10. **BIOLOGICAL** - 生物制品
11. **ASSEMBLY** - 现场组装

### 运输要求

12. **URGENT** - 加急处理
13. **SIGNATURE** - 签收确认

### 其他要求

14. **PHOTO_PROOF** - 拍照存证
15. **INSPECTION** - 开箱检验

## 权限配置

### OMP 权限

- `omp.operation_requirements.view` - 查看操作需求选项
- `omp.operation_requirements.create` - 创建操作需求选项
- `omp.operation_requirements.edit` - 编辑操作需求选项
- `omp.operation_requirements.delete` - 删除操作需求选项

### 客户端权限

- `client.packages.edit` - 编辑包裹信息（包括添加操作需求）

### 仓库权限

- `warehouse.packages.edit` - 编辑包裹信息（包括更新操作需求状态）

## 使用流程

### 1. 初始化默认数据

```bash
node seed/seedOperationRequirements.js
```

### 2. 客户分板时添加操作需求

1. 客户在分板界面选择包裹
2. 选择所需的操作需求选项
3. 添加额外说明（可选）
4. 设置优先级覆盖（可选）
5. 保存操作需求

### 3. 仓库操作员处理操作需求

1. 查看包裹的操作需求列表
2. 按照要求执行相应操作
3. 更新执行状态为"进行中"或"已完成"
4. 添加执行备注

### 4. OMP 管理员维护选项

1. 添加新的操作需求类型
2. 修改现有选项的描述和优先级
3. 启用/停用特定选项
4. 调整选项显示顺序

## 注意事项

1. **删除限制**: 如果操作需求选项正在被包裹使用，则无法删除
2. **权限控制**: 客户只能为自己的包裹添加操作需求
3. **状态追踪**: 系统会记录操作需求的完成时间和操作员
4. **优先级**: 包裹级别的优先级覆盖会替代默认优先级
5. **多语言**: 支持中英文双语显示
