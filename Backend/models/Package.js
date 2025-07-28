export default (sequelize, DataTypes) => {
  const Package = sequelize.define(
    "Package",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      package_code: {
        type: DataTypes.STRING(40),
        allowNull: false,
        unique: true,
      },
      inbond_id: {
        type: DataTypes.BIGINT,
        references: { model: "inbonds", key: "id" },
        allowNull: true,
      },
      forecast_id: {
        type: DataTypes.BIGINT,
        references: { model: "forecasts", key: "id" },
        allowNull: true,
      },
      client_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      length_cm: DataTypes.FLOAT,
      width_cm: DataTypes.FLOAT,
      height_cm: DataTypes.FLOAT,
      weight_kg: DataTypes.FLOAT,
      split_action: {
        type: DataTypes.ENUM("direct", "split", "pickup"),
        defaultValue: "direct",
      },
      status: {
        type: DataTypes.ENUM(
          "prepared",
          "arrived",
          "sorted",
          "cleared",
          "delivered"
        ),
        defaultValue: "prepared",
      },
      remark: { type: DataTypes.TEXT },
    },
    {
      tableName: "packages",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  Package.associate = (models) => {
    Package.belongsTo(models.User, { foreignKey: "client_id", as: "client" });
    Package.belongsTo(models.Inbond, { foreignKey: "inbond_id", as: "inbond" });
    Package.belongsTo(models.Forecast, {
      foreignKey: "forecast_id",
      as: "forecast",
    });
    Package.hasMany(models.PackageItem, {
      foreignKey: "package_id",
      as: "items",
    });
  };

  return Package;
};
