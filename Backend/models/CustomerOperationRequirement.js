export default (sequelize, DataTypes) => {
  const CustomerOperationRequirement = sequelize.define(
    "CustomerOperationRequirement",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      customer_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "customers", key: "id" },
        comment: "客户ID",
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
        comment: "该客户是否可选择",
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "是否启用",
      },
      notes: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: "customer_operation_requirements",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          name: "uq_cust_opreq",
          unique: true,
          fields: ["customer_id", "operation_requirement_id"],
        },
        { name: "idx_cust_opreq_cust", fields: ["customer_id"] },
        { name: "idx_cust_opreq_req", fields: ["operation_requirement_id"] },
        { name: "idx_cust_opreq_enabled", fields: ["is_enabled"] },
      ],
    }
  );

  CustomerOperationRequirement.associate = (models) => {
    CustomerOperationRequirement.belongsTo(models.Customer, {
      foreignKey: "customer_id",
      as: "customer",
    });
    CustomerOperationRequirement.belongsTo(models.OperationRequirement, {
      foreignKey: "operation_requirement_id",
      as: "operationRequirement",
    });
  };

  return CustomerOperationRequirement;
};
