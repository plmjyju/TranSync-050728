export const permissionsSeed = [
  // ========== 系统访问权限 ==========
  { name: "omp.access", display_name: "OMP系统访问权限", module: "system" },
  {
    name: "warehouse.access",
    display_name: "仓库系统访问权限",
    module: "system",
  },
  { name: "agent.access", display_name: "货代系统访问权限", module: "system" },
  { name: "wms.access", display_name: "WMS系统访问权限", module: "system" },
  {
    name: "client.access",
    display_name: "客户端系统访问权限",
    module: "system",
  },

  // ========== 用户管理权限 ==========
  { name: "user.view", display_name: "查看用户列表", module: "user" },
  { name: "user.create", display_name: "创建用户", module: "user" },
  { name: "user.edit", display_name: "编辑用户信息", module: "user" },
  { name: "user.delete", display_name: "删除用户", module: "user" },
  { name: "user.role.assign", display_name: "分配用户角色", module: "user" },
  { name: "user.password.reset", display_name: "重置用户密码", module: "user" },
  { name: "user.status.change", display_name: "修改用户状态", module: "user" },

  // ========== 角色权限管理 ==========
  { name: "role.view", display_name: "查看角色列表", module: "role" },
  { name: "role.create", display_name: "创建角色", module: "role" },
  { name: "role.edit", display_name: "编辑角色信息", module: "role" },
  { name: "role.delete", display_name: "删除角色", module: "role" },
  {
    name: "role.permission.assign",
    display_name: "分配角色权限",
    module: "role",
  },
  { name: "permission.view", display_name: "查看权限列表", module: "role" },

  // ========== 客户管理权限 ==========
  { name: "customer.view", display_name: "查看客户列表", module: "customer" },
  { name: "customer.create", display_name: "创建客户", module: "customer" },
  { name: "customer.edit", display_name: "编辑客户信息", module: "customer" },
  { name: "customer.delete", display_name: "删除客户", module: "customer" },
  {
    name: "customer.status.change",
    display_name: "修改客户状态",
    module: "customer",
  },

  // ========== 预报单权限 (Agent) ==========
  { name: "agent.forecast.view", display_name: "查看预报单", module: "agent" },
  {
    name: "agent.forecast.view.own",
    display_name: "查看自己的预报单",
    module: "agent",
  },
  {
    name: "agent.forecast.view.all",
    display_name: "查看所有预报单",
    module: "agent",
  },
  {
    name: "agent.forecast.create",
    display_name: "创建预报单",
    module: "agent",
  },
  { name: "agent.forecast.edit", display_name: "编辑预报单", module: "agent" },
  {
    name: "agent.forecast.edit.own",
    display_name: "编辑自己的预报单",
    module: "agent",
  },
  {
    name: "agent.forecast.edit.all",
    display_name: "编辑所有预报单",
    module: "agent",
  },
  {
    name: "agent.forecast.delete",
    display_name: "删除预报单",
    module: "agent",
  },
  {
    name: "agent.forecast.submit",
    display_name: "提交预报单",
    module: "agent",
  },
  {
    name: "agent.forecast.cancel",
    display_name: "取消预报单",
    module: "agent",
  },

  // ========== 包裹权限 (Agent) ==========
  { name: "agent.package.view", display_name: "查看包裹", module: "agent" },
  { name: "agent.package.create", display_name: "添加包裹", module: "agent" },
  { name: "agent.package.edit", display_name: "编辑包裹", module: "agent" },
  { name: "agent.package.delete", display_name: "删除包裹", module: "agent" },
  {
    name: "agent.package.batch.import",
    display_name: "批量导入包裹",
    module: "agent",
  },
  {
    name: "agent.package.batch.export",
    display_name: "批量导出包裹",
    module: "agent",
  },

  // ========== HAWB权限 (Agent) ==========
  { name: "agent.hawb.view", display_name: "查看HAWB", module: "agent" },
  { name: "agent.hawb.create", display_name: "创建HAWB", module: "agent" },
  { name: "agent.hawb.edit", display_name: "编辑HAWB", module: "agent" },
  { name: "agent.hawb.delete", display_name: "删除HAWB", module: "agent" },
  {
    name: "agent.hawb.assign",
    display_name: "分配HAWB给包裹",
    module: "agent",
  },

  // ========== 客户端权限 (Client) ==========
  {
    name: "client.dashboard.view",
    display_name: "查看仪表盘",
    module: "client",
  },
  {
    name: "client.forecast.view",
    display_name: "查看预报单信息",
    module: "client",
  },
  {
    name: "client.package.view",
    display_name: "查看包裹信息",
    module: "client",
  },
  {
    name: "client.package.edit",
    display_name: "编辑包裹信息",
    module: "client",
  },
  {
    name: "client.package.track",
    display_name: "跟踪包裹状态",
    module: "client",
  },
  {
    name: "client.statistics.view",
    display_name: "查看统计信息",
    module: "client",
  },
  { name: "client.invoice.view", display_name: "查看账单", module: "client" },
  {
    name: "client.invoice.download",
    display_name: "下载账单",
    module: "client",
  },

  // ========== OMP运营管理权限 ==========
  { name: "omp.dashboard.view", display_name: "查看运营仪表盘", module: "omp" },
  { name: "omp.forecast.view", display_name: "查看所有预报单", module: "omp" },
  { name: "omp.forecast.edit", display_name: "编辑所有预报单", module: "omp" },
  { name: "omp.forecast.approve", display_name: "审批预报单", module: "omp" },
  { name: "omp.forecast.batch", display_name: "批量操作预报单", module: "omp" },
  { name: "omp.forecast.assign", display_name: "分配预报单", module: "omp" },
  { name: "omp.statistics.view", display_name: "查看系统统计", module: "omp" },
  { name: "omp.hawb.manage", display_name: "管理全局HAWB", module: "omp" },
  { name: "omp.settings.view", display_name: "查看系统设置", module: "omp" },
  { name: "omp.settings.edit", display_name: "编辑系统设置", module: "omp" },

  // ========== OMP操作需求管理 ==========
  {
    name: "omp.operation_requirements.view",
    display_name: "查看操作需求选项",
    module: "omp",
  },
  {
    name: "omp.operation_requirements.create",
    display_name: "创建操作需求选项",
    module: "omp",
  },
  {
    name: "omp.operation_requirements.edit",
    display_name: "编辑操作需求选项",
    module: "omp",
  },
  {
    name: "omp.operation_requirements.delete",
    display_name: "删除操作需求选项",
    module: "omp",
  },

  // ========== 仓库管理权限 (Warehouse) ==========
  {
    name: "warehouse.dashboard.view",
    display_name: "查看仓库仪表盘",
    module: "warehouse",
  },

  // 航空板权限
  {
    name: "warehouse.pallet.view",
    display_name: "查看航空板",
    module: "warehouse",
  },
  {
    name: "warehouse.pallet.create",
    display_name: "创建航空板",
    module: "warehouse",
  },
  {
    name: "warehouse.pallet.edit",
    display_name: "编辑航空板",
    module: "warehouse",
  },
  {
    name: "warehouse.pallet.delete",
    display_name: "删除航空板",
    module: "warehouse",
  },
  {
    name: "warehouse.pallet.scan",
    display_name: "扫描包裹到板",
    module: "warehouse",
  },
  {
    name: "warehouse.pallet.inbound",
    display_name: "航空板入仓",
    module: "warehouse",
  },
  {
    name: "warehouse.pallet.unpack",
    display_name: "拆板操作",
    module: "warehouse",
  },
  {
    name: "warehouse.pallet.dispatch",
    display_name: "航空板出库",
    module: "warehouse",
  },
  {
    name: "warehouse.pallet.return",
    display_name: "航空板归还",
    module: "warehouse",
  },
  {
    name: "warehouse.pallet.allocate",
    display_name: "分配包裹到板子",
    module: "warehouse",
  },
  {
    name: "warehouse.pallet.logs",
    display_name: "查看板操作日志",
    module: "warehouse",
  },

  // 提货单权限
  {
    name: "warehouse.delivery_order.view",
    display_name: "查看提货单",
    module: "warehouse",
  },
  {
    name: "warehouse.delivery_order.create",
    display_name: "创建提货单",
    module: "warehouse",
  },
  {
    name: "warehouse.delivery_order.edit",
    display_name: "编辑提货单",
    module: "warehouse",
  },
  {
    name: "warehouse.delivery_order.delete",
    display_name: "删除提货单",
    module: "warehouse",
  },
  {
    name: "warehouse.delivery_order.pickup",
    display_name: "确认提货",
    module: "warehouse",
  },
  {
    name: "warehouse.delivery_order.cancel",
    display_name: "取消提货单",
    module: "warehouse",
  },
  {
    name: "warehouse.delivery_order.transport",
    display_name: "运输管理",
    module: "warehouse",
  },
  {
    name: "warehouse.delivery_order.delivery",
    display_name: "入库完成管理",
    module: "warehouse",
  },

  // 出库权限
  {
    name: "warehouse.outbound.view",
    display_name: "查看出库单",
    module: "warehouse",
  },
  {
    name: "warehouse.outbound.create",
    display_name: "创建出库单",
    module: "warehouse",
  },
  {
    name: "warehouse.outbound.edit",
    display_name: "编辑出库单",
    module: "warehouse",
  },
  {
    name: "warehouse.outbound.confirm",
    display_name: "确认出库",
    module: "warehouse",
  },
  {
    name: "warehouse.outbound.cancel",
    display_name: "取消出库单",
    module: "warehouse",
  },

  // 预报单状态权限
  {
    name: "warehouse.forecast.view",
    display_name: "查看预报单状态",
    module: "warehouse",
  },
  {
    name: "warehouse.forecast.clearance",
    display_name: "管理清关状态",
    module: "warehouse",
  },

  // 库位管理权限
  {
    name: "warehouse.location.view",
    display_name: "查看库位信息",
    module: "warehouse",
  },
  {
    name: "warehouse.location.create",
    display_name: "创建库位",
    module: "warehouse",
  },
  {
    name: "warehouse.location.edit",
    display_name: "编辑库位信息",
    module: "warehouse",
  },
  {
    name: "warehouse.location.delete",
    display_name: "删除库位",
    module: "warehouse",
  },

  // ========== WMS仓库管理系统权限 ==========
  { name: "wms.dashboard.view", display_name: "查看WMS仪表盘", module: "wms" },
  { name: "wms.forecast.view", display_name: "查看预报单信息", module: "wms" },
  { name: "wms.inbound.view", display_name: "查看入库信息", module: "wms" },
  { name: "wms.inbound.create", display_name: "创建入库单", module: "wms" },
  { name: "wms.inbound.edit", display_name: "编辑入库单", module: "wms" },
  { name: "wms.inbound.confirm", display_name: "确认入库", module: "wms" },
  { name: "wms.inventory.view", display_name: "查看库存", module: "wms" },
  { name: "wms.inventory.adjust", display_name: "调整库存", module: "wms" },
  { name: "wms.inventory.count", display_name: "库存盘点", module: "wms" },

  // ========== 入库权限 ==========
  { name: "inbound.view", display_name: "查看入库单", module: "inbound" },
  { name: "inbound.create", display_name: "创建入库单", module: "inbound" },
  { name: "inbound.edit", display_name: "编辑入库单", module: "inbound" },
  { name: "inbound.delete", display_name: "删除入库单", module: "inbound" },
  { name: "inbound.confirm", display_name: "确认入库", module: "inbound" },
  { name: "inbound.cancel", display_name: "取消入库", module: "inbound" },

  // ========== 出库权限 ==========
  { name: "outbound.view", display_name: "查看出库单", module: "outbound" },
  { name: "outbound.create", display_name: "创建出库单", module: "outbound" },
  { name: "outbound.edit", display_name: "编辑出库单", module: "outbound" },
  { name: "outbound.delete", display_name: "删除出库单", module: "outbound" },
  { name: "outbound.approve", display_name: "审批出库单", module: "outbound" },
  { name: "outbound.confirm", display_name: "确认出库", module: "outbound" },
  { name: "outbound.cancel", display_name: "取消出库", module: "outbound" },

  // ========== 库存权限 ==========
  { name: "inventory.view", display_name: "查看库存", module: "inventory" },
  { name: "inventory.adjust", display_name: "调整库存", module: "inventory" },
  { name: "inventory.transfer", display_name: "库存调拨", module: "inventory" },
  { name: "inventory.count", display_name: "库存盘点", module: "inventory" },
  { name: "inventory.report", display_name: "库存报表", module: "inventory" },

  // ========== 报表权限 ==========
  { name: "report.forecast", display_name: "预报单报表", module: "report" },
  { name: "report.package", display_name: "包裹报表", module: "report" },
  { name: "report.inventory", display_name: "库存报表", module: "report" },
  { name: "report.financial", display_name: "财务报表", module: "report" },
  { name: "report.operation", display_name: "运营报表", module: "report" },
  { name: "report.export", display_name: "导出报表", module: "report" },

  // ========== 系统日志权限 ==========
  { name: "log.view", display_name: "查看系统日志", module: "log" },
  { name: "log.export", display_name: "导出日志", module: "log" },
  { name: "log.clear", display_name: "清理日志", module: "log" },
];
