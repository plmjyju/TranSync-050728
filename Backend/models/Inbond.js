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
        references: { model: "users", key: "id" },
      },
      shipping_type: { type: DataTypes.ENUM("air", "sea"), allowNull: false },
      arrival_method: { type: DataTypes.STRING(20) },
      clearance_type: {
        type: DataTypes.ENUM(
          "general_trade", // 一般贸易
          "bonded_warehouse", // 保税仓库
          "cross_border_ecom", // 跨境电商
          "personal_items", // 个人物品
          "samples", // 样品
          "temporary_import", // 暂时进口
          "duty_free", // 免税
          "re_import" // 复进口
        ),
        allowNull: false,
        defaultValue: "general_trade",
        comment: "清关类型",
      },
      tax_type_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "tax_types", key: "id" },
        comment: "税务类型ID",
      },
      status: {
        type: DataTypes.ENUM("draft", "submitted", "arrived", "completed"),
        defaultValue: "draft",
      },
      remark: { type: DataTypes.TEXT },
    },
    {
      tableName: "inbonds",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  Inbond.associate = (models) => {
    Inbond.belongsTo(models.User, { foreignKey: "client_id", as: "client" });
    // Inbond.belongsTo(models.Warehouse, {
    //   foreignKey: "warehouse_id",
    //   as: "warehouse",
    // });
    Inbond.belongsTo(models.TaxType, {
      foreignKey: "tax_type_id",
      as: "taxType",
    });
    Inbond.hasMany(models.Package, { foreignKey: "inbond_id", as: "packages" });
  };

  return Inbond;
};
