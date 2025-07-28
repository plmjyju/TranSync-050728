// 3️⃣ models/InventoryRecord.js
export default (sequelize, DataTypes) => {
  const InventoryRecord = sequelize.define(
    "InventoryRecord",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      package_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "packages", key: "id" },
      },
      warehouse_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "warehouses", key: "id" },
      },
      type: {
        type: DataTypes.ENUM("in", "out"),
        allowNull: false,
      },
      operation_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      remark: {
        type: DataTypes.TEXT,
      },
    },
    {
      tableName: "inventory_records",
      timestamps: false,
    }
  );

  InventoryRecord.associate = (models) => {
    InventoryRecord.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });
    InventoryRecord.belongsTo(models.Package, {
      foreignKey: "package_id",
      as: "package",
    });
    InventoryRecord.belongsTo(models.Warehouse, {
      foreignKey: "warehouse_id",
      as: "warehouse",
    });
  };

  return InventoryRecord;
};
