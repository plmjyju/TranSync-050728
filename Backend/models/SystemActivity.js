export default (sequelize, DataTypes) => {
  const SystemActivity = sequelize.define(
    "SystemActivity",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      client_type: {
        type: DataTypes.ENUM("omp", "wms", "agent", "client"),
        allowNull: false,
      },
      event: {
        type: DataTypes.ENUM(
          "login",
          "logout",
          "register",
          "password_reset",
          "email_verify"
        ),
        allowNull: false,
      },
      ip_address: {
        type: DataTypes.STRING(50),
      },
      user_agent: {
        type: DataTypes.STRING(255),
      },
      remark: {
        type: DataTypes.TEXT,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "system_activities",
      timestamps: false,
    }
  );

  SystemActivity.associate = (models) => {
    SystemActivity.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });
  };

  return SystemActivity;
};
