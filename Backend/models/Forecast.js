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

      // 主要业务状态
      status: {
        type: DataTypes.ENUM(
          "draft", // 草稿
          "palletizing", // 新增：打板中
          "booked", // 已预订
          "in_transit", // 运输中
          "arrived", // 已到达
          "completed", // 新增：流程完成（可选终态）
          "cancelled" // 已取消
        ),
        defaultValue: "draft",
        comment: "主要业务状态",
      },

      // 清关状态（独立维度）
      clearance_status: {
        type: DataTypes.ENUM(
          "pending", // 待清关
          "in_progress", // 清关中
          "partial", // 部分清关
          "completed", // 已清关
          "exempted" // 免清关
        ),
        allowNull: true,
        comment: "清关状态，独立于主要业务状态",
      },

      // 交付状态（独立维度）
      delivery_status: {
        type: DataTypes.ENUM(
          "pending", // 待交付
          "partial_dispatched", // 部分派送
          "partial_delivered", // 部分已交付
          "completed", // 全部已交付
          "incident" // 有异常
        ),
        allowNull: true,
        comment: "交付状态，可以在清关完成前开始",
      },

      // 异常状态标记
      has_incident: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "是否存在异常情况",
      },

      // 进度统计字段
      total_packages: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "总包裹数",
      },
      cleared_packages: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "已清关包裹数",
      },
      dispatched_packages: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "已派送包裹数",
      },
      delivered_packages: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "已交付包裹数",
      },
      incident_packages: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "异常包裹数",
      },
      remark: { type: DataTypes.TEXT },
      tax_type_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "tax_types", key: "id" },
      },
      requirement_summary_json: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment:
          "包裹操作需求统计(JSON数组: {requirement_code, requirement_name, count})",
      },
      requirement_validation_passed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "是否已验证所有包裹具备至少一个操作需求",
      },

      // 新增生命周期时间戳
      palletizing_started_at: { type: DataTypes.DATE },
      booked_at: { type: DataTypes.DATE },
      completed_at: { type: DataTypes.DATE },
      // 打板进度
      total_pallets: { type: DataTypes.INTEGER, defaultValue: 0 },
      palletized_packages: { type: DataTypes.INTEGER, defaultValue: 0 },
      palletization_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
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
    Forecast.belongsTo(models.TaxType, {
      foreignKey: "tax_type_id",
      as: "taxType",
    });
    Forecast.hasMany(models.Package, {
      foreignKey: "forecast_id",
      as: "packages",
    });
    Forecast.hasMany(models.Pallet, {
      foreignKey: "forecast_id",
      as: "pallets",
    });

    // 关联DO（多对多，通过板间接关联）
    Forecast.belongsToMany(models.DeliveryOrder, {
      through: {
        model: "delivery_order_pallets",
        include: [{ model: models.Pallet, as: "pallet" }],
      },
      foreignKey: "forecast_id",
      otherKey: "delivery_order_id",
      as: "deliveryOrders",
    });
  };

  return Forecast;
};
