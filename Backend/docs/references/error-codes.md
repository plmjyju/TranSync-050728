---
status: core
last-reviewed: 2025-08-19
owner: backend
---

# 错误代码索引

规范：PREFIX_DOMAIN_SPECIFIC + 描述 (UPPER_SNAKE_CASE)。返回结构：

```json
{
  "success": false,
  "code": "SPLIT_FINALIZE_SCAN_MISMATCH",
  "message": "扫描数量与确认数量不一致"
}
```

## 1. 通用 (GENERIC\_\*)

| Code                   | 说明          |
| ---------------------- | ------------- |
| GENERIC_INVALID_PARAMS | 参数非法      |
| GENERIC_NOT_FOUND      | 资源不存在    |
| GENERIC_UNAUTHORIZED   | 未认证        |
| GENERIC_FORBIDDEN      | 权限不足      |
| GENERIC_CONFLICT       | 并发/状态冲突 |
| GENERIC_RATE_LIMIT     | 频率限制      |
| GENERIC_INTERNAL_ERROR | 内部错误      |

## 2. 拆板 / 重组 (SPLIT\_\*)

| Code                                     | 场景                      |
| ---------------------------------------- | ------------------------- |
| SPLIT_NOT_FOUND                          | 拆板单不存在              |
| SPLIT_STATUS_INVALID                     | 非法状态迁移              |
| SPLIT_PACKAGE_ALREADY_SCANNED            | 包裹重复扫描              |
| SPLIT_PACKAGE_IN_OTHER_ACTIVE_SPLIT      | 包裹已在其他活动拆板中    |
| SPLIT_TEMP_PALLET_NOT_FOUND              | 临时板不存在              |
| SPLIT_TEMP_PALLET_CLOSED                 | 临时板已关闭              |
| SPLIT_VERIFY_COUNT_MISMATCH              | 验证数量不匹配            |
| SPLIT_FINALIZE_IN_PROGRESS               | Finalize 正在进行         |
| SPLIT_FINALIZE_SCAN_MISMATCH             | Finalize 时扫描数量不一致 |
| SPLIT_FINALIZE_IDEMPOTENCY_HASH_MISMATCH | 幂等哈希不一致            |
| SPLIT_FINALIZE_LEDGER_WRITE_FAILED       | Ledger 写入失败           |
| SPLIT_CANCEL_NOT_ALLOWED                 | 当前状态不可取消          |
| SPLIT_RECOVERY_HASH_CONFLICT             | 恢复任务发现哈希冲突      |

## 3. 台账 / 审计 (LEDGER*/AUDIT*\*)

| Code                     | 场景                     |
| ------------------------ | ------------------------ |
| LEDGER_UNIQUE_KEY_DUP    | unique_key 冲突 (重复写) |
| LEDGER_CHAIN_BROKEN      | 哈希链断裂               |
| LEDGER_DIRECTION_INVALID | 非法方向                 |
| LEDGER_OUTBOX_NOT_FOUND  | Outbox 记录缺失          |
| LEDGER_OUTBOX_MAX_RETRY  | Outbox 超过重试上限      |
| AUDIT_WRITE_FAILED       | 审计写入失败             |

## 4. 预约 / 派送 (DELIVERY\_\*)

| Code                               | 场景           |
| ---------------------------------- | -------------- |
| DELIVERY_WINDOW_CONFLICT           | 时间窗口冲突   |
| DELIVERY_ITEM_NOT_AVAILABLE        | 明细不可用     |
| DELIVERY_INVALID_STATUS_TRANSITION | 非法状态迁移   |
| DELIVERY_VEHICLE_ALREADY_ASSIGNED  | 车辆已指派     |
| DELIVERY_LOAD_QUANTITY_MISMATCH    | 装车数量不匹配 |
| DELIVERY_CANNOT_CANCEL             | 不可取消       |

## 5. 运输集成 (TRANSPORT\_\*)

| Code                             | 场景             |
| -------------------------------- | ---------------- |
| TRANSPORT_WEBHOOK_SIGN_INVALID   | 签名无效         |
| TRANSPORT_WEBHOOK_REPLAY         | Webhook 重放     |
| TRANSPORT_GPS_FETCH_FAILED       | GPS 拉取失败     |
| TRANSPORT_CLEARANCE_NOT_RELEASED | 未放行不允许发运 |
| TRANSPORT_OUTBOX_MAX_RETRY       | 超过最大重试     |

## 6. 出库 (OUTBOUND\_\*)

| Code                         | 场景           |
| ---------------------------- | -------------- |
| OUTBOUND_PACKAGE_UNAVAILABLE | 包裹不可用     |
| OUTBOUND_INVALID_STATUS      | 非法状态迁移   |
| OUTBOUND_PICK_TASK_CONFLICT  | 拣选任务冲突   |
| OUTBOUND_PICK_SCAN_DUP       | 拣选扫描重复   |
| OUTBOUND_REVIEW_DISCREPANCY  | 复核差异未处理 |
| OUTBOUND_CANNOT_DISPATCH     | 未满足发运条件 |

## 7. 权限 / 认证 (AUTH*/PERM*\*)

| Code               | 场景       |
| ------------------ | ---------- |
| AUTH_TOKEN_INVALID | Token 非法 |
| AUTH_TOKEN_EXPIRED | Token 过期 |
| PERM_DENIED        | 权限不足   |

## 8. 配置 / 环境 (CONFIG\_\*)

| Code           | 场景         |
| -------------- | ------------ |
| CONFIG_INVALID | 配置不合法   |
| CONFIG_MISSING | 缺少必要配置 |

## 9. 系统恢复 / 任务 (RECOVERY*\*/JOB*\*)

| Code                             | 场景              |
| -------------------------------- | ----------------- |
| RECOVERY_SPLIT_STUCK             | 拆板卡死恢复触发  |
| RECOVERY_SPLIT_FLAG_RESET_FAILED | 标志复位失败      |
| JOB_OUTBOX_PROCESS_FAILED        | Outbox 批处理失败 |

## 10. 扩展预留前缀

| 前缀       | 未来域            |
| ---------- | ----------------- |
| ADJUST\_   | 库存调整          |
| REVERSAL\_ | 逆向冲正          |
| FORECAST\_ | 预测/需求计划     |
| METRIC\_   | 指标/监控采集异常 |

## 11. 设计原则

1. 单一职责：错误代码只表达一个语义
2. 可定位：看到代码即可推断模块 & 场景
3. 稳定性：变更需兼容旧客户端 (除非版本升级公告)
4. 不暴露敏感内部实现

## 12. 自检清单

- 是否使用 domain 前缀? (Y/N)
- 是否避免重复含义? (Y/N)
- 与审计 action 是否可互补定位? (Y/N)
