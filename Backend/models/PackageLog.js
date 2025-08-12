export default (sequelize, DataTypes) => {
  const PackageLog = sequelize.define(
    "PackageLog",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      package_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "packages", key: "id" },
      },
      action: {
        type: DataTypes.ENUM(
          "created",
          "arrival_confirmed",
          "sorted",
          "cleared",
          "delivered",
          "status_updated",
          "notes_added",
          "storage_scanned", // 入库扫描
          "moved", // 移动
          "damaged", // 损坏报告
          "missing", // 丢失报告
          "returned", // 退回
          "incident" // 异常处理
        ),
        allowNull: false,
      },
      performed_by: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      status_from: {
        type: DataTypes.ENUM(
          "prepared",
          "arrived",
          "sorted",
          "cleared",
          "delivered"
        ),
        allowNull: true,
      },
      status_to: {
        type: DataTypes.ENUM(
          "prepared",
          "arrived",
          "sorted",
          "cleared",
          "delivered"
        ),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // 新增字段支持详细操作信息
      details: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "操作详情（JSON格式）",
      },
      location: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "操作地点",
      },
      operator: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "操作员用户名",
      },
      operator_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "操作员ID",
      },
      // Legacy fields for backward compatibility
      description: { type: DataTypes.STRING(255) },
      operated_by: { type: DataTypes.BIGINT }, // Deprecated, use performed_by
    },
    {
      tableName: "package_logs",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  PackageLog.associate = (models) => {
    PackageLog.belongsTo(models.Package, {
      foreignKey: "package_id",
      as: "package",
    });
    PackageLog.belongsTo(models.User, {
      foreignKey: "performed_by",
      as: "performedBy",
    });
    PackageLog.belongsTo(models.User, {
      foreignKey: "operator_id",
      as: "operator_user",
    });
    // Legacy association
    PackageLog.belongsTo(models.User, {
      foreignKey: "operated_by",
      as: "operatedBy",
    });
  };

  return PackageLog;
};
