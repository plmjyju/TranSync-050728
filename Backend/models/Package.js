export default (sequelize, DataTypes) => {
  const Package = sequelize.define(
    "Package",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      package_code: {
        type: DataTypes.STRING(40),
        allowNull: false,
        unique: true,
        comment: "包裹编号/箱唛号",
      },
      tracking_no: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "追踪号/运单号",
      },
      mawb: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "主运单号(Master Air Waybill)",
      },
      hawb: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "分运单号(House Air Waybill)",
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
      pallet_id: {
        type: DataTypes.BIGINT,
        references: { model: "pallets", key: "id" },
        allowNull: true,
        comment: "所属航空板ID",
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
          "prepared", // 已准备
          "arrived", // 已到达
          "sorted", // 已分拣
          "cleared", // 已清关
          "stored", // 已入库
          "damaged", // 损坏
          "missing", // 丢失
          "delivered", // 已交付/已入仓完成
          "in_transit", // 运输中
          "incident" // 异常状态
        ),
        defaultValue: "prepared",
      },
      // 仓库位置信息
      warehouse_location: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "仓库位置（如：B-01-A-15）",
      },
      storage_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "入库时间",
      },
      storage_operator: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "入库操作员",
      },
      // 分板信息
      assigned_pallet_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "分配的板号",
      },
      remark: { type: DataTypes.TEXT },
      tax_type_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "tax_types", key: "id" },
      },
      // Arrival confirmation fields
      arrival_confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      arrival_confirmed_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
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
    Package.belongsTo(models.Pallet, {
      foreignKey: "pallet_id",
      as: "pallet",
    });
    Package.belongsTo(models.TaxType, {
      foreignKey: "tax_type_id",
      as: "taxType",
    });
    Package.belongsTo(models.User, {
      foreignKey: "arrival_confirmed_by",
      as: "arrivalConfirmedBy",
    });
    Package.hasMany(models.PackageItem, {
      foreignKey: "package_id",
      as: "items",
    });
    Package.hasMany(models.PackageLog, {
      foreignKey: "package_id",
      as: "logs",
    });

    // 关联DO（多对多）
    Package.belongsToMany(models.DeliveryOrder, {
      through: models.DeliveryOrderPackage,
      foreignKey: "package_id",
      otherKey: "delivery_order_id",
      as: "deliveryOrders",
    });

    // 关联操作需求（多对多）
    // 暂时禁用，等模型问题解决后再启用
    /*
    Package.belongsToMany(models.OperationRequirement, {
      through: models.PackageOperationRequirement,
      foreignKey: "package_id",
      otherKey: "operation_requirement_id",
      as: "operationRequirements",
    });
    */

    // 关联板子分配（多对一）
    Package.belongsTo(models.PalletAllocation, {
      foreignKey: "assigned_pallet_number",
      targetKey: "pallet_number",
      as: "palletAllocation",
    });
  };

  return Package;
};
