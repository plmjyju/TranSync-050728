export default (sequelize, DataTypes) => {
  const AgentCustomer = sequelize.define(
    "AgentCustomer",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      agent_id: { type: DataTypes.BIGINT, allowNull: false },
      customer_id: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "agent_customers",
      timestamps: false,
      indexes: [
        { unique: true, fields: ["agent_id", "customer_id"] },
        { fields: ["customer_id"] },
      ],
    }
  );
  return AgentCustomer;
};
