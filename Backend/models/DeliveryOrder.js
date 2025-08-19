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
          "picked_up", // 已开始提货(无板或未扫描)
          "partial_picked", // 新增：部分板已提
          "in_transit", // 运输中(全部已提走)
          "partial_arrived", // 新增：部分板到仓
          "arrived", // 全部板到仓
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
      // 新增: 板统计
      planned_pallet_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "计划板数",
      },
      picked_pallet_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "已提取板数",
      },
      inbound_pallet_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "已到仓(入库)板数",
      },
      inbound_package_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "已到仓(入库)包裹数",
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
      // 结算 / 签收相关
      settlement_state: {
        type: DataTypes.ENUM(
          "pending",
          "awaiting_proof",
          "proof_uploaded",
          "settled"
        ),
        defaultValue: "pending",
        comment:
          "结算状态: pending(流程中) / awaiting_proof(待上传签字DO) / proof_uploaded(已上传待审核) / settled(审核结算完成)",
      },
      signed_do_url: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "签字DO扫描件或图片URL",
      },
      driver_signature_image_url: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "司机签名图片URL",
      },
      settlement_proof_uploaded_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "签字DO上传时间",
      },
      settlement_confirmed_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "结算确认人",
      },
      settlement_confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "结算确认时间",
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
        { fields: ["settlement_state"] },
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
