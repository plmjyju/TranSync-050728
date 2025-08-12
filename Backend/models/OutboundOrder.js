export default (sequelize, DataTypes) => {
  const OutboundOrder = sequelize.define(
    "OutboundOrder",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      outbound_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: "出库单号",
      },
      client_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "客户ID",
      },
      awb_numbers: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: "AWB编号列表（JSON格式存储）",
      },
      pallet_numbers: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: "板号列表（JSON格式存储）",
      },
      total_packages: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "总包裹数量",
      },
      total_weight: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
        comment: "总重量（KG）",
      },
      status: {
        type: DataTypes.ENUM(
          "pending", // 待确认
          "confirmed", // 已确认（仓库已确认，正式出库）
          "cancelled" // 已取消
        ),
        defaultValue: "pending",
        comment: "出库状态",
      },
      pickup_contact_person: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "提货联系人",
      },
      pickup_contact_phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "提货联系电话",
      },
      pickup_vehicle_info: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "提货车辆信息",
      },
      signed_document_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "已签名出库单照片URL",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "备注信息",
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "创建人ID",
      },
      confirmed_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "确认人ID（仓库操作员）",
      },
      confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "确认时间",
      },
    },
    {
      tableName: "outbound_orders",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["outbound_number"],
          unique: true,
        },
        {
          fields: ["client_id"],
        },
        {
          fields: ["status"],
        },
        {
          fields: ["created_by"],
        },
        {
          fields: ["confirmed_by"],
        },
      ],
    }
  );

  OutboundOrder.associate = (models) => {
    OutboundOrder.belongsTo(models.User, {
      foreignKey: "client_id",
      as: "client",
    });
    OutboundOrder.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });
    OutboundOrder.belongsTo(models.User, {
      foreignKey: "confirmed_by",
      as: "confirmer",
    });

    // 关联OutboundOrderLog（一对多）
    OutboundOrder.hasMany(models.OutboundOrderLog, {
      foreignKey: "outbound_order_id",
      as: "logs",
    });
  };

  return OutboundOrder;
};
