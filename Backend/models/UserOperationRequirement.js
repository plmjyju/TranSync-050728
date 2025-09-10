export default (sequelize, DataTypes) => {
  const UserOperationRequirement = sequelize.define(
    "UserOperationRequirement",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "用户ID",
      },
      operation_requirement_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "operation_requirements", key: "id" },
        comment: "OperationRequirement ID",
      },
      is_selectable: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "该用户是否可选择此Requirement",
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "是否启用(软禁用时保留记录)",
      },
      notes: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "用户特定备注 / 标签",
      },
    },
    {
      tableName: "user_operation_requirements",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          name: "uq_user_opreq",
          unique: true,
          fields: ["user_id", "operation_requirement_id"],
        },
        { name: "idx_user_opreq_user", fields: ["user_id"] },
        { name: "idx_user_opreq_req", fields: ["operation_requirement_id"] },
        { name: "idx_user_opreq_enabled", fields: ["is_enabled"] },
      ],
    }
  );

  UserOperationRequirement.associate = (models) => {
    UserOperationRequirement.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });
    UserOperationRequirement.belongsTo(models.OperationRequirement, {
      foreignKey: "operation_requirement_id",
      as: "operationRequirement",
    });
  };

  return UserOperationRequirement;
};
