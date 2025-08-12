export default (sequelize, DataTypes) => {
  const OutboundOrderLog = sequelize.define(
    "OutboundOrderLog",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      outbound_order_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "outbound_orders", key: "id" },
        comment: "出库单ID",
      },
      action: {
        type: DataTypes.ENUM(
          "created", // 创建出库单
          "confirmed", // 仓库确认出库
          "cancelled", // 取消出库单
          "document_uploaded", // 上传签名文档
          "modified" // 修改出库单
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
      old_value: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "操作前的值（JSON格式）",
      },
      new_value: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "操作后的值（JSON格式）",
      },
      details: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "操作详情（JSON格式）",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "操作备注",
      },
    },
    {
      tableName: "outbound_order_logs",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["outbound_order_id"],
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

  OutboundOrderLog.associate = (models) => {
    OutboundOrderLog.belongsTo(models.OutboundOrder, {
      foreignKey: "outbound_order_id",
      as: "outboundOrder",
    });
    OutboundOrderLog.belongsTo(models.User, {
      foreignKey: "operator_id",
      as: "operator",
    });
  };

  return OutboundOrderLog;
};
