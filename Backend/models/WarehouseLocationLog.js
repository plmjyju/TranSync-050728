export default (sequelize, DataTypes) => {
  const WarehouseLocationLog = sequelize.define(
    "WarehouseLocationLog",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      warehouse_location_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "warehouse_locations", key: "id" },
        comment: "库位ID",
      },
      action: {
        type: DataTypes.ENUM(
          "created", // 创建库位
          "updated", // 更新库位信息
          "blocked", // 阻塞库位
          "unblocked", // 解除阻塞
          "occupied", // 占用库位
          "released", // 释放库位
          "capacity_changed", // 容量变更
          "type_changed", // 类型变更
          "requirements_updated", // 特殊要求更新
          "disabled", // 停用
          "enabled", // 启用
          "maintenance" // 维护
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
      related_entity_type: {
        type: DataTypes.ENUM("pallet_allocation", "package", "other"),
        allowNull: true,
        comment: "关联实体类型",
      },
      related_entity_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: "关联实体ID",
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
      tableName: "warehouse_location_logs",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["warehouse_location_id"],
        },
        {
          fields: ["action"],
        },
        {
          fields: ["operator_id"],
        },
        {
          fields: ["related_entity_type", "related_entity_id"],
        },
        {
          fields: ["created_at"],
        },
      ],
    }
  );

  WarehouseLocationLog.associate = (models) => {
    WarehouseLocationLog.belongsTo(models.WarehouseLocation, {
      foreignKey: "warehouse_location_id",
      as: "warehouseLocation",
    });
    WarehouseLocationLog.belongsTo(models.User, {
      foreignKey: "operator_id",
      as: "operator",
    });
  };

  return WarehouseLocationLog;
};
