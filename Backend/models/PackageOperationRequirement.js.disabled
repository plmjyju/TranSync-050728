export default (sequelize, DataTypes) => {
  const PackageOperationRequirement = sequelize.define(
    "PackageOperationRequirement",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      package_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "packages", key: "id" },
        comment: "包裹ID",
      },
      operation_requirement_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "operation_requirements", key: "id" },
        comment: "操作需求ID",
      },
      additional_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "额外说明（针对该包裹的特定要求）",
      },
      priority_override: {
        type: DataTypes.ENUM("low", "medium", "high", "critical"),
        allowNull: true,
        comment: "优先级覆盖（如果与默认优先级不同）",
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "添加人ID（通常是客户）",
      },
      fulfilled_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "完成时间",
      },
      fulfilled_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "完成人ID（仓库操作员）",
      },
      fulfillment_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "完成备注",
      },
      status: {
        type: DataTypes.ENUM("pending", "in_progress", "completed", "skipped"),
        defaultValue: "pending",
        comment: "执行状态",
      },
    },
    {
      tableName: "package_operation_requirements",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["package_id"],
        },
        {
          fields: ["operation_requirement_id"],
        },
        {
          fields: ["status"],
        },
      ],
    }
  );

  PackageOperationRequirement.associate = (models) => {
    PackageOperationRequirement.belongsTo(models.Package, {
      foreignKey: "package_id",
      as: "package",
    });
    PackageOperationRequirement.belongsTo(models.OperationRequirement, {
      foreignKey: "operation_requirement_id",
      as: "operationRequirement",
    });
    PackageOperationRequirement.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });
    PackageOperationRequirement.belongsTo(models.User, {
      foreignKey: "fulfilled_by",
      as: "fulfiller",
    });
  };

  return PackageOperationRequirement;
};
