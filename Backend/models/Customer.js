export default (sequelize, DataTypes) => {
  const Customer = sequelize.define(
    "Customer",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      customerName: { type: DataTypes.STRING(100), allowNull: false },
      companyName: { type: DataTypes.STRING(100) },
      contactName: { type: DataTypes.STRING(100) },
      telephone: { type: DataTypes.STRING(50) },
      email: { type: DataTypes.STRING(100) },
      address: { type: DataTypes.STRING(255) },
      remark: { type: DataTypes.STRING(255) },

      adminAccount: { type: DataTypes.STRING(50), allowNull: false },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },

      salesRepId: { type: DataTypes.BIGINT },
      serviceRepId: { type: DataTypes.BIGINT },
      accountManagerId: { type: DataTypes.BIGINT },

      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "customers",
      timestamps: false,
    }
  );

  return Customer;
};
