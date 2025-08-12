export default (sequelize, DataTypes) => {
  const PalletAllocation = sequelize.define(
    "PalletAllocation",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      pallet_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: "板子编号",
      },
      awb_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "AWB编号",
      },
      total_package_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "板里的箱子总数",
      },
      allocated_package_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "已分配的箱子数量",
      },
      warehouse_location_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "warehouse_locations", key: "id" },
        comment: "库位号ID",
      },
      operation_requirements: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "操作需求列表（JSON格式存储）",
      },
      status: {
        type: DataTypes.ENUM(
          "created", // 已创建
          "allocating", // 分配中
          "completed", // 分配完成
          "stored", // 已入库
          "shipped", // 已出库
          "cancelled" // 已取消
        ),
        defaultValue: "created",
        comment: "分板状态",
      },
      priority_level: {
        type: DataTypes.ENUM("low", "medium", "high", "critical"),
        defaultValue: "medium",
        comment: "优先级别",
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
      allocated_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "分配操作员ID",
      },
      allocated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "分配完成时间",
      },
      stored_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "入库操作员ID",
      },
      stored_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "入库时间",
      },
    },
    {
      tableName: "pallet_allocations",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["pallet_number"],
          unique: true,
        },
        {
          fields: ["awb_number"],
        },
        {
          fields: ["status"],
        },
        {
          fields: ["warehouse_location_id"],
        },
        {
          fields: ["created_by"],
        },
      ],
    }
  );

  PalletAllocation.associate = (models) => {
    PalletAllocation.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });
    PalletAllocation.belongsTo(models.User, {
      foreignKey: "allocated_by",
      as: "allocator",
    });
    PalletAllocation.belongsTo(models.User, {
      foreignKey: "stored_by",
      as: "storer",
    });
    PalletAllocation.belongsTo(models.WarehouseLocation, {
      foreignKey: "warehouse_location_id",
      as: "warehouseLocation",
    });

    // 关联Package（一对多）
    PalletAllocation.hasMany(models.Package, {
      foreignKey: "assigned_pallet_number",
      sourceKey: "pallet_number",
      as: "packages",
    });

    // 关联PalletAllocationLog（一对多）
    PalletAllocation.hasMany(models.PalletAllocationLog, {
      foreignKey: "pallet_allocation_id",
      as: "logs",
    });
  };

  return PalletAllocation;
};
