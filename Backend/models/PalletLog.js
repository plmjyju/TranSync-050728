export default (sequelize, DataTypes) => {
  const PalletLog = sequelize.define(
    "PalletLog",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      pallet_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "pallets", key: "id" },
      },
      action: {
        type: DataTypes.ENUM(
          "created", // 板创建
          "inbound", // 入仓
          "location_updated", // 位置变更
          "unpacked", // 拆板
          "packed", // 装板
          "dispatched", // 出库
          "returned", // 归还
          "status_changed", // 状态变更
          "weight_updated", // 重量更新
          "remark_added" // 添加备注
        ),
        allowNull: false,
        comment: "操作类型",
      },
      old_status: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "变更前状态",
      },
      new_status: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "变更后状态",
      },
      old_location: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "变更前位置",
      },
      new_location: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "变更后位置",
      },
      operator: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "操作人姓名",
      },
      operator_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "操作人ID",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "操作描述",
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "额外元数据，如包裹数量变化等",
      },
    },
    {
      tableName: "pallet_logs",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["pallet_id"],
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

  PalletLog.associate = (models) => {
    PalletLog.belongsTo(models.Pallet, {
      foreignKey: "pallet_id",
      as: "pallet",
    });

    PalletLog.belongsTo(models.User, {
      foreignKey: "operator_id",
      as: "operatorUser",
    });
  };

  return PalletLog;
};
