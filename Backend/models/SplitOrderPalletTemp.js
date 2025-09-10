export default (sequelize, DataTypes) => {
  const SplitOrderPalletTemp = sequelize.define(
    "SplitOrderPalletTemp",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      split_order_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "split_orders", key: "id" },
      },
      operation_requirement_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "operation_requirements", key: "id" },
      },
      group_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "需求组索引(1开始)",
      },
      sequence_no: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "同一需求下第几个板",
      },
      status: {
        type: DataTypes.ENUM("open", "full", "confirmed"),
        allowNull: false,
        defaultValue: "open",
      },
      scanned_package_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      pallet_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "pallets", key: "id" },
        comment: "确认后生成的真实板ID",
      },
    },
    {
      tableName: "split_order_pallet_temps",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["split_order_id"] },
        { fields: ["operation_requirement_id"] },
        { fields: ["status"] },
        {
          unique: true,
          name: "uq_split_pallet_temp_seq",
          fields: ["split_order_id", "operation_requirement_id", "sequence_no"],
        },
        {
          fields: ["split_order_id", "status"],
          name: "idx_split_pallet_temp_split_status",
        },
      ],
    }
  );

  SplitOrderPalletTemp.associate = (models) => {
    SplitOrderPalletTemp.belongsTo(models.SplitOrder, {
      foreignKey: "split_order_id",
      as: "splitOrder",
    });
    SplitOrderPalletTemp.belongsTo(models.OperationRequirement, {
      foreignKey: "operation_requirement_id",
      as: "operationRequirement",
    });
    SplitOrderPalletTemp.belongsTo(models.Pallet, {
      foreignKey: "pallet_id",
      as: "pallet",
    });
  };

  return SplitOrderPalletTemp;
};
