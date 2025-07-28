export default (sequelize, DataTypes) => {
  const PackageLog = sequelize.define(
    "PackageLog",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      package_id: { type: DataTypes.BIGINT, allowNull: false },
      action: { type: DataTypes.STRING(50), allowNull: false },
      description: { type: DataTypes.STRING(255) },
      operated_by: { type: DataTypes.BIGINT }, // user.id
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "package_logs",
      timestamps: false,
    }
  );

  PackageLog.associate = (models) => {
    PackageLog.belongsTo(models.Package, {
      foreignKey: "package_id",
      as: "package",
    });
    PackageLog.belongsTo(models.User, {
      foreignKey: "operated_by",
      as: "operator",
    });
  };

  return PackageLog;
};
