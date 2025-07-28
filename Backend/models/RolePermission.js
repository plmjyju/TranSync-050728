// models/RolePermission.js
export default (sequelize, DataTypes) => {
  const RolePermission = sequelize.define(
    "RolePermission",
    {
      role_id: {
        type: DataTypes.BIGINT,
        references: { model: "roles", key: "id" },
      },
      permission_id: {
        type: DataTypes.BIGINT,
        references: { model: "permissions", key: "id" },
      },
    },
    {
      tableName: "role_permissions",
      timestamps: false,
    }
  );

  return RolePermission;
};
