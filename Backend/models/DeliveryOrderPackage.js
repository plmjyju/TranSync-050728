export default (sequelize, DataTypes) => {
  const DeliveryOrderPackage = sequelize.define(
    "DeliveryOrderPackage",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },

      delivery_order_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "delivery_orders", key: "id" },
        comment: "DO ID",
      },

      package_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "packages", key: "id" },
        comment: "包裹ID",
      },

      // 状态
      pickup_status: {
        type: DataTypes.ENUM(
          "pending", // 待提货
          "picked_up", // 已提货
          "cancelled" // 已取消
        ),
        defaultValue: "pending",
        comment: "提货状态",
      },

      // 提货时间
      pickup_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "实际提货时间",
      },

      remark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "备注",
      },
    },
    {
      tableName: "delivery_order_packages",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["delivery_order_id", "package_id"],
          unique: true,
        },
        {
          fields: ["pickup_status"],
        },
      ],
    }
  );

  DeliveryOrderPackage.associate = (models) => {
    // 关联DO
    DeliveryOrderPackage.belongsTo(models.DeliveryOrder, {
      foreignKey: "delivery_order_id",
      as: "deliveryOrder",
    });

    // 关联包裹
    DeliveryOrderPackage.belongsTo(models.Package, {
      foreignKey: "package_id",
      as: "package",
    });
  };

  return DeliveryOrderPackage;
};
