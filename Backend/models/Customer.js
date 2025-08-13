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
        field: "customerName", // 明确指定数据库字段名
      },
      companyName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: "companyName", // 明确指定数据库字段名
      },
      contactName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: "contactName", // 明确指定数据库字段名
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
        field: "salesRepId", // 明确指定数据库字段名
      },
      serviceRepId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: "serviceRepId", // 明确指定数据库字段名
      },
      accountManagerId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: "accountManagerId", // 明确指定数据库字段名
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
      underscored: false, // 覆盖全局设置，保持原有字段名
    }
  );

  return Customer;
};
