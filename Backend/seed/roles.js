// 角色种子数据
export const rolesSeed = [
  // ========== 系统管理员角色 ==========
  {
    name: "super_admin",
    display_name: "超级管理员",
    description: "拥有系统所有权限",
    permissions: "ALL", // 特殊标记，表示拥有所有权限
  },

  // ========== OMP运营管理角色 ==========
  {
    name: "omp_manager",
    display_name: "OMP运营经理",
    description: "运营管理系统管理员",
    permissions: [
      "omp.access",
      "omp.dashboard.view",
      "omp.forecast.view",
      "omp.forecast.edit",
      "omp.forecast.approve",
      "omp.forecast.batch",
      "omp.forecast.assign",
      "omp.statistics.view",
      "omp.hawb.manage",
      "omp.settings.view",
      "omp.settings.edit",
      "omp.operation_requirements.view",
      "omp.operation_requirements.create",
      "omp.operation_requirements.edit",
      "omp.operation_requirements.delete",
      "user.view",
      "customer.view",
      "customer.create",
      "customer.edit",
      "customer.status.change",
      "report.forecast",
      "report.package",
      "report.operation",
      "report.export",
      "log.view",
    ],
  },
  {
    name: "omp_operator",
    display_name: "OMP运营专员",
    description: "运营管理系统操作员",
    permissions: [
      "omp.access",
      "omp.dashboard.view",
      "omp.forecast.view",
      "omp.forecast.edit",
      "omp.forecast.batch",
      "omp.statistics.view",
      "omp.operation_requirements.view",
      "customer.view",
      "report.forecast",
      "report.package",
      "report.operation",
    ],
  },

  // ========== Agent货代角色 ==========
  {
    name: "agent_manager",
    display_name: "货代经理",
    description: "货代管理员，可查看所有货代数据",
    permissions: [
      "agent.access",
      "agent.forecast.view.all",
      "agent.forecast.create",
      "agent.forecast.edit.all",
      "agent.forecast.delete",
      "agent.forecast.submit",
      "agent.forecast.cancel",
      "agent.package.view",
      "agent.package.create",
      "agent.package.edit",
      "agent.package.delete",
      "agent.package.batch.import",
      "agent.package.batch.export",
      "agent.hawb.view",
      "agent.hawb.create",
      "agent.hawb.edit",
      "agent.hawb.delete",
      "agent.hawb.assign",
      "customer.view",
      "report.forecast",
      "report.package",
    ],
  },
  {
    name: "agent_operator",
    display_name: "货代操作员",
    description: "普通货代操作员，只能操作自己的数据",
    permissions: [
      "agent.access",
      "agent.forecast.view.own",
      "agent.forecast.create",
      "agent.forecast.edit.own",
      "agent.forecast.submit",
      "agent.package.view",
      "agent.package.create",
      "agent.package.edit",
      "agent.package.batch.import",
      "agent.package.batch.export",
      "agent.hawb.view",
      "agent.hawb.create",
      "agent.hawb.edit",
      "agent.hawb.assign",
    ],
  },

  // ========== Warehouse仓库角色 ==========
  {
    name: "warehouse_manager",
    display_name: "仓库经理",
    description: "仓库管理员",
    permissions: [
      "warehouse.access",
      "warehouse.dashboard.view",
      "warehouse.pallet.view",
      "warehouse.pallet.create",
      "warehouse.pallet.edit",
      "warehouse.pallet.delete",
      "warehouse.pallet.scan",
      "warehouse.pallet.inbound",
      "warehouse.pallet.unpack",
      "warehouse.pallet.dispatch",
      "warehouse.pallet.return",
      "warehouse.pallet.allocate",
      "warehouse.pallet.logs",
      "warehouse.delivery_order.view",
      "warehouse.delivery_order.create",
      "warehouse.delivery_order.edit",
      "warehouse.delivery_order.delete",
      "warehouse.delivery_order.pickup",
      "warehouse.delivery_order.cancel",
      "warehouse.delivery_order.transport",
      "warehouse.delivery_order.delivery",
      "warehouse.outbound.view",
      "warehouse.outbound.create",
      "warehouse.outbound.edit",
      "warehouse.outbound.confirm",
      "warehouse.outbound.cancel",
      "warehouse.forecast.view",
      "warehouse.forecast.clearance",
      "warehouse.location.view",
      "warehouse.location.create",
      "warehouse.location.edit",
      "warehouse.location.delete",
      "inventory.view",
      "inventory.adjust",
      "inventory.transfer",
      "inventory.count",
      "report.inventory",
    ],
  },
  {
    name: "warehouse_operator",
    display_name: "仓库操作员",
    description: "仓库普通操作员",
    permissions: [
      "warehouse.access",
      "warehouse.dashboard.view",
      "warehouse.pallet.view",
      "warehouse.pallet.scan",
      "warehouse.pallet.inbound",
      "warehouse.pallet.unpack",
      "warehouse.pallet.allocate",
      "warehouse.delivery_order.view",
      "warehouse.delivery_order.pickup",
      "warehouse.delivery_order.transport",
      "warehouse.delivery_order.delivery",
      "warehouse.outbound.view",
      "warehouse.outbound.confirm",
      "warehouse.forecast.view",
      "warehouse.location.view",
      "inventory.view",
    ],
  },

  // ========== WMS仓储管理角色 ==========
  {
    name: "wms_manager",
    display_name: "WMS管理员",
    description: "WMS系统管理员",
    permissions: [
      "wms.access",
      "wms.dashboard.view",
      "wms.forecast.view",
      "wms.inbound.view",
      "wms.inbound.create",
      "wms.inbound.edit",
      "wms.inbound.confirm",
      "wms.inventory.view",
      "wms.inventory.adjust",
      "wms.inventory.count",
      "inbound.view",
      "inbound.create",
      "inbound.edit",
      "inbound.confirm",
      "inbound.cancel",
      "outbound.view",
      "outbound.create",
      "outbound.edit",
      "outbound.confirm",
      "outbound.cancel",
      "inventory.view",
      "inventory.adjust",
      "inventory.transfer",
      "inventory.count",
      "inventory.report",
      "report.inventory",
    ],
  },
  {
    name: "wms_operator",
    display_name: "WMS操作员",
    description: "WMS系统操作员",
    permissions: [
      "wms.access",
      "wms.dashboard.view",
      "wms.forecast.view",
      "wms.inbound.view",
      "wms.inbound.create",
      "wms.inbound.edit",
      "wms.inventory.view",
      "inbound.view",
      "inbound.create",
      "inbound.edit",
      "outbound.view",
      "inventory.view",
    ],
  },

  // ========== 客户角色 ==========
  {
    name: "client_vip",
    display_name: "VIP客户",
    description: "VIP客户，拥有更多权限",
    permissions: [
      "client.access",
      "client.dashboard.view",
      "client.forecast.view",
      "client.package.view",
      "client.package.edit",
      "client.package.track",
      "client.statistics.view",
      "client.invoice.view",
      "client.invoice.download",
    ],
  },
  {
    name: "client_standard",
    display_name: "普通客户",
    description: "普通客户权限",
    permissions: [
      "client.access",
      "client.dashboard.view",
      "client.forecast.view",
      "client.package.view",
      "client.package.track",
      "client.statistics.view",
      "client.invoice.view",
    ],
  },

  // ========== 财务角色 ==========
  {
    name: "finance_manager",
    display_name: "财务经理",
    description: "财务管理员",
    permissions: [
      "omp.access",
      "client.invoice.view",
      "client.invoice.download",
      "report.financial",
      "report.operation",
      "report.export",
      "customer.view",
      "log.view",
    ],
  },

  // ========== 客服角色 ==========
  {
    name: "customer_service",
    display_name: "客服专员",
    description: "客户服务专员",
    permissions: [
      "omp.access",
      "client.forecast.view",
      "client.package.view",
      "client.package.track",
      "agent.forecast.view.all",
      "agent.package.view",
      "warehouse.forecast.view",
      "customer.view",
      "customer.edit",
      "report.forecast",
      "report.package",
    ],
  },
];

// 角色权限关联种子数据生成函数
export const generateRolePermissionsSeed = async (roles, permissions) => {
  const rolePermissions = [];

  for (const role of roles) {
    if (role.permissions === "ALL") {
      // 超级管理员拥有所有权限
      for (const permission of permissions) {
        rolePermissions.push({
          role_name: role.name,
          permission_name: permission.name,
        });
      }
    } else if (Array.isArray(role.permissions)) {
      // 其他角色按权限列表分配
      for (const permissionName of role.permissions) {
        rolePermissions.push({
          role_name: role.name,
          permission_name: permissionName,
        });
      }
    }
  }

  return rolePermissions;
};
