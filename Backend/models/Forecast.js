export default (sequelize, DataTypes) => {
  const Forecast = sequelize.define(
    "Forecast",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      forecast_code: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
      },
      agent_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      mawb: { type: DataTypes.STRING(50) },
      order_number: { type: DataTypes.STRING(50) },
      primary_service: { type: DataTypes.STRING(100) },
      secondary_service: { type: DataTypes.STRING(100) },
      flight_no: { type: DataTypes.STRING(50) },
      is_full_board: { type: DataTypes.BOOLEAN },
      departure_port: { type: DataTypes.STRING(50) },
      destination_port: { type: DataTypes.STRING(50) },
      transit_port: { type: DataTypes.STRING(50) },
      weight: { type: DataTypes.FLOAT },
      box_count: { type: DataTypes.INTEGER },
      item_count: { type: DataTypes.INTEGER },
      etd: { type: DataTypes.DATE },
      eta: { type: DataTypes.DATE },
      atd: { type: DataTypes.DATE },
      ata: { type: DataTypes.DATE },
      transit_eta: { type: DataTypes.DATE },
      transit_ata: { type: DataTypes.DATE },
      cleared_at: { type: DataTypes.DATE },
      picked_up_at: { type: DataTypes.DATE },
      delivered_at: { type: DataTypes.DATE },
      status: {
        type: DataTypes.ENUM(
          "draft",
          "booked",
          "in_transit",
          "arrived",
          "cleared",
          "completed"
        ),
        defaultValue: "draft",
      },
      remark: { type: DataTypes.TEXT },
    },
    {
      tableName: "forecasts",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  Forecast.associate = (models) => {
    Forecast.belongsTo(models.User, { foreignKey: "agent_id", as: "agent" });
    Forecast.hasMany(models.Package, {
      foreignKey: "forecast_id",
      as: "packages",
    });
  };

  return Forecast;
};
