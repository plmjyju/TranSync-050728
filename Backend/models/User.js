export default (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      full_name: { type: DataTypes.STRING(100) },
      status: {
        type: DataTypes.ENUM("active", "disabled"),
        defaultValue: "active",
      },
      last_login_at: { type: DataTypes.DATE },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "users",
      timestamps: false,
    }
  );

  User.associate = (models) => {
    User.belongsTo(models.Role, { foreignKey: "role_id", as: "role" });
  };

  return User;
};
