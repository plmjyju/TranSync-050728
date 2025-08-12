export default (sequelize, DataTypes) => {
  const TaxType = sequelize.define(
    "TaxType",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      taxRate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
        comment: "Tax rate as decimal (e.g., 0.13 for 13%)",
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "Display order for frontend",
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "tax_types",
      timestamps: false,
    }
  );

  return TaxType;
};
