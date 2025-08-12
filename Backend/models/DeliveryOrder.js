export default (sequelize, DataTypes) => {
  const DeliveryOrder = sequelize.define(
    "DeliveryOrder",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },

      // DO号 - 自动生成，格式：DO250802-01
      do_number: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: "DO号，格式：DO250802-01",
      },

      // 状态
      status: {
        type: DataTypes.ENUM(
          "pending", // 待提货
          "picked_up", // 已提货
          "in_transit", // 运输中
          "arrived", // 已到达仓库
          "delivered", // 已交付/入库完成
          "cancelled", // 已取消
          "allocated", // 已分配待确认
          "incident" // 运输异常
        ),
        defaultValue: "pending",
        comment: "DO状态",
      },

      // 管理模式
      management_type: {
        type: DataTypes.ENUM("pallet", "package"),
        defaultValue: "pallet",
        comment: "管理模式：按板(pallet)或按包裹(package)",
      },

      // 包裹相关统计（当management_type为package时使用）
      total_package_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "总包裹数量",
      },
      picked_package_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "已提取包裹数量",
      },

      // 司机信息
      driver_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "司机姓名",
      },
      driver_id_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "司机证件号",
      },

      // 车辆信息
      vehicle_plate: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: "车牌号",
      },
      usdot_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "USDOT号",
      },

      // 提货信息
      pickup_location: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "提货地点（仓位/库区）",
      },
      pickup_details: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "提货明细",
      },

      // 时间记录
      pickup_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "实际提货时间",
      },
      departure_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "离开地仓时间",
      },
      estimated_arrival: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "预计到达仓库时间",
      },
      arrival_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "实际到达仓库时间",
      },
      delivery_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "入库完成时间",
      },

      // 运输信息
      target_warehouse: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "目标仓库",
      },
      transport_distance: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        comment: "运输距离（公里）",
      },
      current_location: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "当前位置",
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true,
        comment: "当前纬度",
      },
      longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
        comment: "当前经度",
      },

      // 仓库确认信息
      warehouse_confirmed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "是否已仓库确认",
      },
      warehouse_confirm_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "仓库确认时间",
      },
      confirmed_pallet_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "仓库确认的实际板数",
      },
      confirmed_package_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "仓库确认的实际箱数",
      },

      // 操作信息
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "创建人ID（仓库工作人员）",
      },
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
      tableName: "delivery_orders",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["do_number"],
          unique: true,
        },
        {
          fields: ["status"],
        },
        {
          fields: ["created_by"],
        },
        {
          fields: ["pickup_time"],
        },
      ],
    }
  );

  DeliveryOrder.associate = (models) => {
    // 关联创建人
    DeliveryOrder.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });

    // 关联操作人
    DeliveryOrder.belongsTo(models.User, {
      foreignKey: "operator_id",
      as: "operatorUser",
    });

    // 关联板（多对多，通过中间表）
    DeliveryOrder.belongsToMany(models.Pallet, {
      through: models.DeliveryOrderPallet,
      foreignKey: "delivery_order_id",
      otherKey: "pallet_id",
      as: "pallets",
    });

    // 关联包裹（多对多，通过中间表）
    DeliveryOrder.belongsToMany(models.Package, {
      through: models.DeliveryOrderPackage,
      foreignKey: "delivery_order_id",
      otherKey: "package_id",
      as: "packages",
    });

    // 关联日志
    DeliveryOrder.hasMany(models.DeliveryOrderLog, {
      foreignKey: "delivery_order_id",
      as: "logs",
    });
  };

  return DeliveryOrder;
};
