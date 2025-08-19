export default (sequelize, DataTypes) => {
  const SplitOrder = sequelize.define(
    "SplitOrder",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      split_order_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
        comment: "分板单号 SPK<YYMMDD>-NN",
      },
      awb: { type: DataTypes.STRING(50), allowNull: false },
      source_pmc_pallet_ids: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "JSON 数组字符串",
      },
      total_packages_expected: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      distinct_operation_requirements_expected: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      scanned_package_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM(
          "created",
          "assigned",
          "processing",
          "verifying",
          "completed",
          "cancelled"
        ),
        allowNull: false,
        defaultValue: "created",
      },
      assigned_user_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      remark: { type: DataTypes.TEXT, allowNull: true },
      assigned_at: { type: DataTypes.DATE, allowNull: true },
      started_at: { type: DataTypes.DATE, allowNull: true },
      verify_started_at: { type: DataTypes.DATE, allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      cancelled_at: { type: DataTypes.DATE, allowNull: true },
      finalize_in_progress: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Finalize 进行中标记, 防止重复并发",
      },
      last_finalize_error: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "上次 finalize 错误信息",
      },
    },
    {
      tableName: "split_orders",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["awb"] },
        { fields: ["status"] },
        { fields: ["split_order_number"], unique: true },
      ],
    }
  );

  SplitOrder.associate = (models) => {
    SplitOrder.hasMany(models.SplitOrderRequirementStat, {
      foreignKey: "split_order_id",
      as: "requirementStats",
    });
    SplitOrder.hasMany(models.SplitOrderPalletTemp, {
      foreignKey: "split_order_id",
      as: "tempPallets",
    });
    SplitOrder.hasMany(models.SplitOrderPackageScan, {
      foreignKey: "split_order_id",
      as: "scans",
    });
    SplitOrder.belongsTo(models.User, {
      foreignKey: "assigned_user_id",
      as: "assignee",
    });
  };

  // Status constants & allowed transitions for semantic consistency
  SplitOrder.STATUSES = Object.freeze({
    CREATED: "created",
    ASSIGNED: "assigned",
    PROCESSING: "processing",
    VERIFYING: "verifying",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
  });

  SplitOrder.ALLOWED_TRANSITIONS = Object.freeze({
    created: ["assigned", "cancelled"],
    assigned: ["processing", "cancelled"],
    processing: ["verifying", "cancelled"],
    verifying: ["completed"],
    completed: [],
    cancelled: [],
  });

  SplitOrder.canTransition = function (from, to) {
    return (SplitOrder.ALLOWED_TRANSITIONS[from] || []).includes(to);
  };

  return SplitOrder;
};
