# FTZ (自由贸易区) 出入口信息合规管理

## 概述

根据 FTZ（Free Trade Zone）自由贸易区的监管要求，系统现已集成完整的出入口信息记录和合规管理功能，确保所有包裹的进出境信息都符合海关和自贸区的监管规定。

## FTZ 合规字段

### Package 模型新增字段

```javascript
// FTZ入境信息
ftz_entry_port: "入境口岸";
ftz_entry_date: "入境日期";
ftz_entry_permit: "入境许可证号";
ftz_customs_declaration: "海关申报单号";
ftz_zone_code: "自贸区代码";
ftz_bonded_warehouse: "保税仓库代码";
ftz_regulatory_status: "监管状态"; // pending/cleared/bonded/exempted

// FTZ出境信息
ftz_exit_port: "出境口岸";
ftz_exit_date: "出境日期";
ftz_exit_permit: "出境许可证号";
```

### 监管状态枚举值

- **pending**: 待监管（默认状态）
- **cleared**: 已清关
- **bonded**: 保税状态
- **exempted**: 免检放行

## API 接口

### 1. 包裹扫描入库（含 FTZ 信息）

```
POST /api/warehouse/package-storage/scan-package-storage
```

**请求示例：**

```json
{
  "package_code": "PKG001",
  "do_number": "DO250802-01",
  "warehouse_location": "A-01-B-15",
  "operator_notes": "正常入库",
  "ftz_entry_info": {
    "entry_port": "CNSHA",
    "entry_date": "2025-08-02",
    "entry_permit_no": "EP2025080201",
    "customs_declaration_no": "CD2025080201",
    "ftz_zone_code": "SHFTZ001",
    "bonded_warehouse_code": "BW-SHA-001",
    "regulatory_status": "pending"
  }
}
```

### 2. 增强版仓库确认（含 FTZ 信息）

```
POST /api/warehouse/enhanced-confirm/{do_id}/enhanced-warehouse-confirm
```

**请求示例：**

```json
{
  "scanned_packages": ["PKG001", "PKG002"],
  "warehouse_location": "A-01-B-15",
  "operator_notes": "批量入库确认",
  "ftz_entry_info": {
    "entry_port": "CNSHA",
    "entry_date": "2025-08-02",
    "entry_permit_no": "EP2025080201",
    "customs_declaration_no": "CD2025080201",
    "ftz_zone_code": "SHFTZ001",
    "bonded_warehouse_code": "BW-SHA-001",
    "regulatory_status": "pending"
  }
}
```

### 3. FTZ 合规性报告

```
GET /api/warehouse/ftz-compliance/ftz-compliance-report
```

**查询参数：**

- `start_date`: 开始日期
- `end_date`: 结束日期
- `ftz_zone_code`: 自贸区代码
- `regulatory_status`: 监管状态
- `entry_port`: 入境口岸
- `export_format`: 导出格式 (json/csv)

**响应示例：**

```json
{
  "report_info": {
    "generated_at": "2025-08-02T10:30:00Z",
    "generated_by": "warehouse_user",
    "filter_criteria": {
      "start_date": "2025-08-01",
      "end_date": "2025-08-02",
      "ftz_zone_code": "SHFTZ001"
    }
  },
  "statistics": {
    "total_packages": 100,
    "by_regulatory_status": {
      "pending": 20,
      "cleared": 60,
      "bonded": 15,
      "exempted": 5
    },
    "by_ftz_zone": {
      "SHFTZ001": 80,
      "SZFTZ002": 20
    },
    "compliance_rate": "85.00%"
  },
  "packages": [...]
}
```

### 4. 更新 FTZ 出境信息

```
POST /api/warehouse/ftz-compliance/update-ftz-exit/{package_id}
```

**请求示例：**

```json
{
  "ftz_exit_port": "CNSHA",
  "ftz_exit_date": "2025-08-05",
  "ftz_exit_permit": "EX2025080501",
  "final_regulatory_status": "cleared",
  "operator_notes": "正常出境"
}
```

### 5. FTZ 监管状态总览

```
GET /api/warehouse/ftz-compliance/ftz-regulatory-overview
```

**响应示例：**

```json
{
  "overview": {
    "total_packages": 500,
    "pending": 50,
    "cleared": 300,
    "bonded": 120,
    "exempted": 30,
    "completed_exit": 280
  },
  "zone_breakdown": {
    "SHFTZ001": {
      "total": 300,
      "pending": 30,
      "cleared": 200,
      "bonded": 60,
      "exempted": 10
    }
  },
  "compliance_metrics": {
    "clearance_rate": "86.0%",
    "exit_completion_rate": "56.0%",
    "pending_rate": "10.0%"
  }
}
```

## 合规性要求

### 1. 入境信息记录要求

- **入境口岸**: 必须记录准确的港口/机场代码
- **入境日期**: 精确到日期的入境时间
- **入境许可证**: 海关颁发的入境许可证号
- **海关申报单**: 对应的海关申报单号
- **自贸区代码**: 货物所在的自贸区编码
- **保税仓库**: 指定的保税仓库编码

### 2. 监管状态管理

#### 状态流转图：

```
pending → in_progress → cleared/bonded/exempted
   ↓           ↓              ↓
待监管     →   清关中      →   已清关/保税/免检
```

#### 状态更新触发点：

- **入库扫描**: 自动设置为 `pending`
- **清关开始**: 更新为 `in_progress`
- **清关完成**: 更新为 `cleared`
- **保税入库**: 更新为 `bonded`
- **免检放行**: 更新为 `exempted`

### 3. 出境信息记录

- **出境口岸**: 离境的港口/机场代码
- **出境日期**: 实际离境时间
- **出境许可证**: 出境许可证号
- **最终状态**: 出境时的最终监管状态

## 操作日志合规

所有 FTZ 相关操作都会在 PackageLog 中记录详细信息：

```json
{
  "package_id": 123,
  "action": "storage_scanned",
  "operator": "warehouse_user",
  "details": {
    "ftz_compliance": {
      "entry_port": "CNSHA",
      "entry_date": "2025-08-02",
      "entry_permit_no": "EP2025080201",
      "customs_declaration_no": "CD2025080201",
      "ftz_zone_code": "SHFTZ001",
      "bonded_warehouse_code": "BW-SHA-001",
      "regulatory_status": "pending",
      "compliance_timestamp": "2025-08-02T10:30:00Z"
    }
  }
}
```

## 报表和审计

### 1. 合规性报告

- 支持 JSON 和 CSV 格式导出
- 按日期范围、自贸区、监管状态筛选
- 提供详细的统计分析
- 包含合规率计算

### 2. 审计追踪

- 完整的操作日志记录
- 时间戳精确到秒
- 操作员身份记录
- 状态变更历史

### 3. 异常监控

- 监管状态异常包裹识别
- 超期未清关包裹告警
- 出入境信息不完整提醒
- 合规率低于阈值告警

## 权限控制

### FTZ 相关权限

- `warehouse.packages.edit`: 编辑包裹 FTZ 信息
- `warehouse.ftz.view`: 查看 FTZ 合规报告
- `warehouse.ftz.export`: 导出 FTZ 合规数据
- `warehouse.ftz.audit`: 审计 FTZ 操作日志

## 前端集成建议

### 1. 入库界面

- FTZ 信息录入表单
- 自贸区代码选择器
- 监管状态显示
- 合规性验证提示

### 2. 报表界面

- 合规性统计仪表板
- 状态分布图表
- 异常包裹列表
- 导出功能按钮

### 3. 监控界面

- 实时监管状态监控
- 异常告警显示
- 合规率趋势图
- 审计日志查看

这个 FTZ 合规管理系统确保了所有包裹的出入境信息都能够满足自由贸易区的监管要求，提供了完整的合规性记录、报告和审计功能。
