export default (sequelize, DataTypes) => {
  const Inbond = sequelize.define(
    "Inbond",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      inbond_code: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
      },
      client_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        // 外键应指向 customers.id（历史上曾指向 users.id）
        references: { model: "customers", key: "id" },
      },
      shipping_type: { type: DataTypes.ENUM("air", "sea"), allowNull: false },
      arrival_method: { type: DataTypes.STRING(20) },
      clearance_type: {
        type: DataTypes.ENUM(
          // 兼容旧值
          "general_trade",
          "bonded_warehouse",
          "cross_border_ecom",
          "personal_items",
          "samples",
          "temporary_import",
          "duty_free",
          "re_import",
          // 新增代码型值
          "T01",
          "T11",
          "T06-T01"
        ),
        allowNull: false,
        defaultValue: "general_trade",
        comment: "清关类型/代码（兼容旧值 + 新增代码）",
      },
      tax_type_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "tax_types", key: "id" },
        comment: "税务类型ID",
      },
      status: {
        type: DataTypes.ENUM(
          "draft",
          "submitted",
          // 兼容旧 arrived/completed，同时新增更贴近业务语义的状态
          "arrived",
          "completed",
          "warehouse_processing", // 仓库处理中
          "checked_in", // 已入库
          "exception" // 异常
        ),
        defaultValue: "draft",
      },
      remark: { type: DataTypes.TEXT },
      // 新增：清关信息汇总（多 item 聚合结果，可用于展示与导出）
      clearance_summary_json: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment:
          "清关信息条目汇总(JSON数组，每项与 InbondDeclarationItem 字段类似)",
      },
      // 新增：最后一次相关包裹扫描时间（任一关联包裹扫描时更新）
      last_package_scan_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "该入库单下最后一次包裹扫描时间",
      },
      requirement_summary_json: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment:
          "包裹操作需求统计结果(JSON数组，每项: {requirement_code, requirement_name, count})",
      },
      requirement_validation_passed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "是否已验证所有包裹具备至少一个操作需求",
      },
      // 新增完成记录字段
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "全部包裹接收完成时间",
      },
      completed_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: "完成操作的代理用户ID",
      },
    },
    {
      tableName: "inbonds",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  Inbond.associate = (models) => {
    // 修正为关联 Customer，别名保持 client
    Inbond.belongsTo(models.Customer, {
      foreignKey: "client_id",
      as: "client",
    });
    // Inbond.belongsTo(models.Warehouse, {
    //   foreignKey: "warehouse_id",
    //   as: "warehouse",
    // });
    Inbond.belongsTo(models.TaxType, {
      foreignKey: "tax_type_id",
      as: "taxType",
    });
    Inbond.hasMany(models.Package, { foreignKey: "inbond_id", as: "packages" });
    // 新增：清关条目关联
    Inbond.hasMany(models.InbondDeclarationItem, {
      foreignKey: "inbond_id",
      as: "declarationItems",
    });
  };

  return Inbond;
};
