export default (sequelize, DataTypes) => {
  const Role = sequelize.define(
    "Role",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(50), unique: true },
      display_name: { type: DataTypes.STRING(100) },
      description: { type: DataTypes.TEXT },
      status: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: "roles",
      timestamps: false,
    }
  );

  Role.associate = (models) => {
    Role.hasMany(models.User, { foreignKey: "role_id", as: "users" });
    Role.belongsToMany(models.Permission, {
      through: "RolePermission",
      foreignKey: "role_id",
      as: "permissions",
    });
  };

  return Role;
};
