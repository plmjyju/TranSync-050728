export default (sequelize, DataTypes) => {
  const DeliveryOrderLog = sequelize.define(
    "DeliveryOrderLog",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },

      delivery_order_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "delivery_orders", key: "id" },
        comment: "DO ID",
      },

      action: {
        type: DataTypes.ENUM(
          "created", // 创建
          "updated", // 更新
          "picked_up", // 提货
          "delivered", // 送达
          "cancelled" // 取消
        ),
        allowNull: false,
        comment: "操作类型",
      },

      old_status: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "原状态",
      },

      new_status: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "新状态",
      },

      operator: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "操作人",
      },

      operator_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
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
        comment: "元数据（JSON格式）",
      },
    },
    {
      tableName: "delivery_order_logs",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["delivery_order_id"],
        },
        {
          fields: ["action"],
        },
        {
          fields: ["operator_id"],
        },
      ],
    }
  );

  DeliveryOrderLog.associate = (models) => {
    // 关联DO
    DeliveryOrderLog.belongsTo(models.DeliveryOrder, {
      foreignKey: "delivery_order_id",
      as: "deliveryOrder",
    });

    // 关联操作人
    DeliveryOrderLog.belongsTo(models.User, {
      foreignKey: "operator_id",
      as: "operatorUser",
    });
  };

  return DeliveryOrderLog;
};
