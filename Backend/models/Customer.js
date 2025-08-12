export default (sequelize, DataTypes) => {
  const Customer = sequelize.define(
    "Customer",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      customerName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      companyName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      contactName: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      telephone: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      remark: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      adminAccount: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "transync1234",
      },
      salesRepId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      serviceRepId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      accountManagerId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "customers",
      timestamps: false,
    }
  );

  return Customer;
};
