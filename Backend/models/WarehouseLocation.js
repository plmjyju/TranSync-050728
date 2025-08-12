export default (sequelize, DataTypes) => {
  const WarehouseLocation = sequelize.define(
    "WarehouseLocation",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      location_code: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
        comment: "库位编号（如：A-01-02-03）",
      },
      location_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "库位名称",
      },
      warehouse_zone: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: "仓库区域（如：A、B、C区）",
      },
      aisle: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: "巷道号（如：01、02、03）",
      },
      rack: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: "货架号（如：01、02、03）",
      },
      level: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: "层级号（如：01、02、03）",
      },
      location_type: {
        type: DataTypes.ENUM(
          "standard", // 标准库位
          "oversized", // 超大件库位
          "cold_storage", // 冷库库位
          "hazmat", // 危险品库位
          "secure", // 安全库位
          "temporary", // 临时库位
          "staging" // 暂存区
        ),
        defaultValue: "standard",
        comment: "库位类型",
      },
      capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "库位容量（可存放的托盘/包裹数量）",
      },
      current_occupancy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "当前占用数量",
      },
      max_weight_kg: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "最大承重（公斤）",
      },
      max_height_cm: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "最大高度（厘米）",
      },
      temperature_min: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "最低温度（摄氏度）",
      },
      temperature_max: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "最高温度（摄氏度）",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "是否启用",
      },
      is_blocked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "是否被阻塞（维修中等）",
      },
      block_reason: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "阻塞原因",
      },
      special_requirements: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "特殊要求（JSON格式）",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "备注信息",
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "创建人ID",
      },
      updated_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "更新人ID",
      },
    },
    {
      tableName: "warehouse_locations",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["location_code"],
          unique: true,
        },
        {
          fields: ["warehouse_zone"],
        },
        {
          fields: ["location_type"],
        },
        {
          fields: ["is_active"],
        },
        {
          fields: ["is_blocked"],
        },
        {
          fields: ["warehouse_zone", "aisle", "rack", "level"],
        },
      ],
    }
  );

  WarehouseLocation.associate = (models) => {
    WarehouseLocation.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });
    WarehouseLocation.belongsTo(models.User, {
      foreignKey: "updated_by",
      as: "updater",
    });

    // 关联PalletAllocation（一对多）
    WarehouseLocation.hasMany(models.PalletAllocation, {
      foreignKey: "warehouse_location_id",
      as: "palletAllocations",
    });

    // 关联WarehouseLocationLog（一对多）
    WarehouseLocation.hasMany(models.WarehouseLocationLog, {
      foreignKey: "warehouse_location_id",
      as: "logs",
    });
  };

  return WarehouseLocation;
};
