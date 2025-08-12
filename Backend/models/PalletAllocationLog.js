export default (sequelize, DataTypes) => {
  const PalletAllocationLog = sequelize.define(
    "PalletAllocationLog",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      pallet_allocation_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "pallet_allocations", key: "id" },
        comment: "板子分配ID",
      },
      action: {
        type: DataTypes.ENUM(
          "created", // 创建板子
          "package_allocated", // 分配包裹
          "package_removed", // 移除包裹
          "location_assigned", // 分配库位
          "location_changed", // 更改库位
          "requirements_updated", // 更新操作需求
          "status_changed", // 状态变更
          "stored", // 入库
          "shipped", // 出库
          "cancelled", // 取消
          "notes_updated" // 更新备注
        ),
        allowNull: false,
        comment: "操作类型",
      },
      operator_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "操作员ID",
      },
      details: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "操作详情（JSON格式）",
      },
      old_value: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "变更前的值",
      },
      new_value: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "变更后的值",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "操作备注",
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: "操作IP地址",
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "用户代理信息",
      },
    },
    {
      tableName: "pallet_allocation_logs",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["pallet_allocation_id"],
        },
        {
          fields: ["action"],
        },
        {
          fields: ["operator_id"],
        },
        {
          fields: ["created_at"],
        },
      ],
    }
  );

  PalletAllocationLog.associate = (models) => {
    PalletAllocationLog.belongsTo(models.PalletAllocation, {
      foreignKey: "pallet_allocation_id",
      as: "palletAllocation",
    });
    PalletAllocationLog.belongsTo(models.User, {
      foreignKey: "operator_id",
      as: "operator",
    });
  };

  return PalletAllocationLog;
};
