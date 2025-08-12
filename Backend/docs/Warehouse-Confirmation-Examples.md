# 仓库确认操作示例

## 场景 1：正常确认（数量一致）

### 步骤 1：查询 DO 信息

```bash
# 查询DO仓库确认信息
curl -X GET "http://localhost:3000/api/warehouse/delivery-order/123/warehouse-info" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**返回信息：**

```json
{
  "do_number": "DO250803-01",
  "status": "arrived",
  "management_type": "pallet",
  "expected_quantities": {
    "pallet_count": 3,
    "package_count": 75,
    "total_weight_kg": 1800.5
  },
  "cargo_details": {
    "pallets": [
      {
        "id": 101,
        "pallet_code": "PLT001",
        "custom_board_no": "B001",
        "box_count": 25,
        "weight_kg": 600.2
      },
      {
        "id": 102,
        "pallet_code": "PLT002",
        "custom_board_no": "B002",
        "box_count": 25,
        "weight_kg": 600.1
      },
      {
        "id": 103,
        "pallet_code": "PLT003",
        "custom_board_no": "B003",
        "box_count": 25,
        "weight_kg": 600.2
      }
    ]
  },
  "confirmation_template": {
    "actual_pallet_count": 3,
    "actual_package_count": 75,
    "warehouse_receiver": "",
    "discrepancy_notes": "",
    "remark": ""
  }
}
```

### 步骤 2：实地核查

仓库人员小王到卸货区核查：

- 实际看到 3 个板
- 每个板上都有 25 箱货物
- 货物外观完好无损

### 步骤 3：确认数量

```bash
# 提交确认信息
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/123/warehouse-confirm" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actual_pallet_count": 3,
    "actual_package_count": 75,
    "warehouse_receiver": "王小明",
    "remark": "货物状况良好，与DO单完全一致"
  }'
```

**确认结果：**

```json
{
  "message": "仓库确认完成，货物数量正常",
  "do_number": "DO250803-01",
  "status": "arrived",
  "confirmation_result": {
    "has_discrepancy": false,
    "expected_pallet_count": 3,
    "actual_pallet_count": 3,
    "expected_package_count": 75,
    "actual_package_count": 75,
    "discrepancies": []
  },
  "next_step": "可以继续进行入库操作"
}
```

---

## 场景 2：异常确认（数量不符）

### 步骤 1：查询 DO 信息

```bash
# 查询DO仓库确认信息
curl -X GET "http://localhost:3000/api/warehouse/delivery-order/124/warehouse-info" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**返回信息显示：**

- 预期板数：4 板
- 预期箱数：100 箱

### 步骤 2：实地核查发现问题

仓库人员小李到卸货区核查发现：

- 实际只有 3 个板
- 第 1 板：25 箱（正常）
- 第 2 板：25 箱（正常）
- 第 3 板：20 箱（少了 5 箱）
- 第 4 板：缺失整板

### 步骤 3：异常确认

```bash
# 提交异常确认
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/124/warehouse-confirm" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actual_pallet_count": 3,
    "actual_package_count": 70,
    "warehouse_receiver": "李小华",
    "discrepancy_notes": "缺失第4板(PLT004)，第3板(PLT003)少5箱，可能在运输过程中丢失",
    "remark": "建议联系司机和地仓核实情况"
  }'
```

**异常结果：**

```json
{
  "message": "仓库确认完成，发现货物差异，已标记为异常",
  "do_number": "DO250803-02",
  "status": "incident",
  "confirmation_result": {
    "has_discrepancy": true,
    "expected_pallet_count": 4,
    "actual_pallet_count": 3,
    "expected_package_count": 100,
    "actual_package_count": 70,
    "discrepancies": [
      {
        "type": "pallet_count",
        "expected": 4,
        "actual": 3,
        "difference": -1,
        "description": "板数不符：预期4板，实际3板"
      },
      {
        "type": "package_count",
        "expected": 100,
        "actual": 70,
        "difference": -30,
        "description": "箱数不符：预期100箱，实际70箱"
      }
    ]
  },
  "next_step": "请联系相关部门处理货物差异问题"
}
```

---

## 场景 3：包裹模式确认

### 步骤 1：查询包裹模式 DO

```bash
# 包裹管理模式的DO
curl -X GET "http://localhost:3000/api/warehouse/delivery-order/125/warehouse-info" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**返回信息：**

```json
{
  "do_number": "DO250803-03",
  "status": "arrived",
  "management_type": "package",
  "expected_quantities": {
    "pallet_count": 0,
    "package_count": 50,
    "total_weight_kg": 800.0
  },
  "cargo_details": {
    "packages": [
      {
        "id": 1001,
        "package_code": "PKG001",
        "weight_kg": 16.0
      }
      // ... 其他49个包裹
    ]
  }
}
```

### 步骤 2：确认包裹数量

```bash
# 确认包裹数量（只需要填package_count）
curl -X POST "http://localhost:3000/api/warehouse/delivery-order/125/warehouse-confirm" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actual_package_count": 50,
    "warehouse_receiver": "张小芳",
    "remark": "50个包裹全部到齐，状况良好"
  }'
```

---

## 场景 4：查看确认历史

### 查看操作日志

```bash
# 查看DO的所有操作历史
curl -X GET "http://localhost:3000/api/warehouse/delivery-order/123/logs" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**日志示例：**

```json
{
  "logs": [
    {
      "id": 501,
      "action": "warehouse_confirm_normal",
      "old_status": "arrived",
      "new_status": "arrived",
      "operator": "王小明",
      "description": "仓库确认正常，板数箱数与DO单一致",
      "metadata": {
        "confirm_time": "2025-08-03T15:45:00Z",
        "warehouse_receiver": "王小明",
        "expected_pallet_count": 3,
        "actual_pallet_count": 3,
        "expected_package_count": 75,
        "actual_package_count": 75,
        "has_discrepancy": false
      },
      "created_at": "2025-08-03T15:45:00Z"
    },
    {
      "id": 500,
      "action": "arrived_warehouse",
      "old_status": "in_transit",
      "new_status": "arrived",
      "operator": "系统",
      "description": "到达仓库：总仓库A区",
      "created_at": "2025-08-03T15:30:00Z"
    }
  ]
}
```

## 操作要点

1. **核查重点**

   - 板数是否与 DO 单一致
   - 每板的箱数是否正确
   - 货物外观是否完好

2. **录入要求**

   - 实际数量必须如实填写
   - 差异说明要详细具体
   - 接收人信息要完整

3. **异常处理**

   - 立即拍照记录现场情况
   - 详细记录差异原因
   - 及时上报相关部门

4. **后续流程**
   - 正常确认：继续入库操作
   - 异常确认：等待处理指示，暂停入库
