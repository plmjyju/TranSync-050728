export default (sequelize, DataTypes) => {
  const SplitOrderRequirementStat = sequelize.define(
    "SplitOrderRequirementStat",
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
      requirement_abbr: { type: DataTypes.STRING(20), allowNull: true },
      expected_package_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      scanned_package_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      pallet_group_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "该操作需求分配的组索引(1开始)",
      },
    },
    {
      tableName: "split_order_requirement_stats",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["split_order_id"] },
        { fields: ["operation_requirement_id"] },
        {
          unique: true,
          name: "uq_split_req_stat",
          fields: ["split_order_id", "operation_requirement_id"],
        },
      ],
    }
  );

  SplitOrderRequirementStat.associate = (models) => {
    SplitOrderRequirementStat.belongsTo(models.SplitOrder, {
      foreignKey: "split_order_id",
      as: "splitOrder",
    });
    SplitOrderRequirementStat.belongsTo(models.OperationRequirement, {
      foreignKey: "operation_requirement_id",
      as: "operationRequirement",
    });
  };

  return SplitOrderRequirementStat;
};
