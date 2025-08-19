export default (sequelize, DataTypes) => {
  const SplitOrderPackageScan = sequelize.define(
    "SplitOrderPackageScan",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      split_order_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "split_orders", key: "id" },
      },
      package_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "packages", key: "id" },
      },
      operation_requirement_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "operation_requirements", key: "id" },
      },
      temp_pallet_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "split_order_pallet_temps", key: "id" },
      },
      sequence_in_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      scan_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      scanned_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      duplicate_flag: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: "split_order_package_scans",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["split_order_id"] },
        { fields: ["package_id"] },
        { fields: ["operation_requirement_id"] },
        { fields: ["temp_pallet_id"] },
        { unique: true, fields: ["split_order_id", "package_id"] },
      ],
    }
  );

  SplitOrderPackageScan.associate = (models) => {
    SplitOrderPackageScan.belongsTo(models.SplitOrder, {
      foreignKey: "split_order_id",
      as: "splitOrder",
    });
    SplitOrderPackageScan.belongsTo(models.Package, {
      foreignKey: "package_id",
      as: "package",
    });
    SplitOrderPackageScan.belongsTo(models.OperationRequirement, {
      foreignKey: "operation_requirement_id",
      as: "operationRequirement",
    });
    SplitOrderPackageScan.belongsTo(models.SplitOrderPalletTemp, {
      foreignKey: "temp_pallet_id",
      as: "tempPallet",
    });
  };

  return SplitOrderPackageScan;
};
