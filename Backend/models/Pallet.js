export default (sequelize, DataTypes) => {
  const Pallet = sequelize.define(
    "Pallet",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      pallet_code: {
        type: DataTypes.STRING(40),
        allowNull: false,
        unique: true,
        comment: "航空板号，如 PMC001、LD3-002",
      },
      custom_board_no: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "agent自定义板号，如 B4/10，用于告诉航司地仓这是第几板",
      },
      forecast_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "forecasts", key: "id" },
        comment: "所属预报单",
      },
      pallet_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "板类型，如 PMC、LD3、AKE、木板等",
      },

      // 尺寸重量信息
      length_cm: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "长度(厘米)",
      },
      width_cm: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "宽度(厘米)",
      },
      height_cm: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "高度(厘米)",
      },
      weight_kg: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "总重量(公斤)",
      },
      box_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "板上包裹数量",
      },

      // 仓库位置和状态管理
      location_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "仓库内定位编码，如 A1-B2-C3",
      },
      status: {
        type: DataTypes.ENUM(
          "pending", // 待入仓
          "stored", // 已入仓
          "waiting_clear", // 等待出清
          "unpacked", // 已拆板
          "dispatched", // 已出库/运输中
          "returned", // 空板已归还
          "delivered", // 已入仓完成
          "incident" // 异常状态
        ),
        defaultValue: "pending",
        comment: "板当前状态",
      },

      // 拆板和出库状态
      is_unpacked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "是否已拆板",
      },
      is_full_board: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "是否整板出库，无需拆板",
      },

      // 时间记录
      inbound_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "实际入仓时间",
      },
      returned_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "板归还或送出时间",
      },
      position_updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "板位或状态最近更新时间",
      },

      // 操作信息
      operator: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "最近操作人",
      },
      operator_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "最近操作人ID",
      },

      remark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "备注信息",
      },
    },
    {
      tableName: "pallets",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["forecast_id"],
        },
        {
          fields: ["status"],
        },
        {
          fields: ["location_code"],
        },
        {
          fields: ["is_unpacked"],
        },
      ],
    }
  );

  Pallet.associate = (models) => {
    // 关联预报单
    Pallet.belongsTo(models.Forecast, {
      foreignKey: "forecast_id",
      as: "forecast",
    });

    // 关联操作人
    Pallet.belongsTo(models.User, {
      foreignKey: "operator_id",
      as: "operatorUser",
    });

    // 关联包裹（一对多）
    Pallet.hasMany(models.Package, {
      foreignKey: "pallet_id",
      as: "packages",
    });

    // 关联日志（一对多）
    Pallet.hasMany(models.PalletLog, {
      foreignKey: "pallet_id",
      as: "logs",
    });

    // 关联DO（多对多）
    Pallet.belongsToMany(models.DeliveryOrder, {
      through: "delivery_order_pallets",
      foreignKey: "pallet_id",
      otherKey: "delivery_order_id",
      as: "deliveryOrders",
    });
  };

  return Pallet;
};
