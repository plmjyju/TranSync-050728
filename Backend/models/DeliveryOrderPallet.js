export default (sequelize, DataTypes) => {
  const DeliveryOrderPallet = sequelize.define(
    "DeliveryOrderPallet",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },

      delivery_order_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "delivery_orders", key: "id" },
        comment: "DO ID",
      },

      pallet_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "pallets", key: "id" },
        comment: "板ID",
      },

      // 冗余字段，方便查询
      forecast_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "forecasts", key: "id" },
        comment: "预报单ID",
      },

      // 装载信息
      loading_sequence: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "装载顺序",
      },

      remark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "备注",
      },
    },
    {
      tableName: "delivery_order_pallets",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["delivery_order_id", "pallet_id"],
          unique: true,
        },
        {
          fields: ["forecast_id"],
        },
      ],
    }
  );

  DeliveryOrderPallet.associate = (models) => {
    // 关联DO
    DeliveryOrderPallet.belongsTo(models.DeliveryOrder, {
      foreignKey: "delivery_order_id",
      as: "deliveryOrder",
    });

    // 关联板
    DeliveryOrderPallet.belongsTo(models.Pallet, {
      foreignKey: "pallet_id",
      as: "pallet",
    });

    // 关联预报单
    DeliveryOrderPallet.belongsTo(models.Forecast, {
      foreignKey: "forecast_id",
      as: "forecast",
    });
  };

  return DeliveryOrderPallet;
};
