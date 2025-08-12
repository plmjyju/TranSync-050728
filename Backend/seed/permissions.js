export const permissionsSeed = [
  { name: "inbound.create", display_name: "创建入库单", module: "inbound" },
  { name: "inbound.edit", display_name: "编辑入库单", module: "inbound" },
  { name: "inbound.delete", display_name: "删除入库单", module: "inbound" },
  { name: "outbound.create", display_name: "创建出库单", module: "outbound" },
  { name: "outbound.approve", display_name: "审批出库单", module: "outbound" },
  { name: "inventory.view", display_name: "查看库存", module: "inventory" },
  { name: "inventory.adjust", display_name: "调整库存", module: "inventory" },
  { name: "user.manage", display_name: "用户管理", module: "users" },

  // Warehouse 仓库管理权限
  {
    name: "warehouse.access",
    display_name: "仓库系统访问",
    module: "warehouse",
  },
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
    name: "warehouse.pallet.logs",
    display_name: "查看板操作日志",
    module: "warehouse",
  },
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
    display_name: "运输管理（开始运输、位置更新、异常报告、到达确认）",
    module: "warehouse",
  },
  {
    name: "warehouse.delivery_order.delivery",
    display_name: "入库完成管理",
    module: "warehouse",
  },
  {
    name: "warehouse.forecast.clearance",
    display_name: "管理清关状态",
    module: "warehouse",
  },
  {
    name: "warehouse.forecast.view",
    display_name: "查看预报单状态",
    module: "warehouse",
  },

  // Warehouse 板子分配权限
  {
    name: "warehouse.pallet.allocate",
    display_name: "分配包裹到板子",
    module: "warehouse",
  },

  // Warehouse 库位管理权限
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

  // Client 客户端权限
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
    name: "client.packages.edit",
    display_name: "编辑包裹信息",
    module: "client",
  },
  {
    name: "client.statistics.view",
    display_name: "查看统计信息",
    module: "client",
  },

  // Agent 货代权限
  {
    name: "agent.forecast.view",
    display_name: "查看预报单",
    module: "agent",
  },
  {
    name: "agent.forecast.create",
    display_name: "创建预报单",
    module: "agent",
  },
  {
    name: "agent.forecast.edit",
    display_name: "编辑预报单",
    module: "agent",
  },
  {
    name: "agent.package.create",
    display_name: "添加包裹",
    module: "agent",
  },
  {
    name: "agent.package.edit",
    display_name: "编辑包裹",
    module: "agent",
  },
  {
    name: "agent.hawb.manage",
    display_name: "管理HAWB分运单号",
    module: "agent",
  },

  // OMP 运营管理权限
  {
    name: "omp.forecast.view",
    display_name: "查看所有预报单",
    module: "omp",
  },
  {
    name: "omp.forecast.edit",
    display_name: "编辑所有预报单",
    module: "omp",
  },
  {
    name: "omp.forecast.batch",
    display_name: "批量操作预报单",
    module: "omp",
  },
  {
    name: "omp.statistics.view",
    display_name: "查看系统统计",
    module: "omp",
  },
  {
    name: "omp.hawb.manage",
    display_name: "管理全局HAWB分运单号",
    module: "omp",
  },

  // OMP 操作需求管理权限
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

  // 仓库出库管理权限
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
];
