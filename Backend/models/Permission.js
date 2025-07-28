export default (sequelize, DataTypes) => {
  const Permission = sequelize.define(
    "Permission",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(100), unique: true },
      display_name: { type: DataTypes.STRING(100) },
      module: { type: DataTypes.STRING(50) },
      description: { type: DataTypes.TEXT },
    },
    {
      tableName: "permissions",
      timestamps: false,
    }
  );

  Permission.associate = (models) => {
    Permission.belongsToMany(models.Role, {
      through: "RolePermission",
      foreignKey: "permission_id",
      as: "roles",
    });
  };

  return Permission;
};
