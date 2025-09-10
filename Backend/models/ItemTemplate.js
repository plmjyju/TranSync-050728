export default (sequelize, DataTypes) => {
  const ItemTemplate = sequelize.define(
    "ItemTemplate",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      client_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: "客户ID（Customer.id）",
      },
      // 新增：物品名称（同客户下唯一）
      product_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "物品名称",
      },
      sku: { type: DataTypes.STRING(100), allowNull: true, comment: "SKU" },
      description_of_good: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "用途/描述",
      },
      hs_code: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "HS Code",
      },
      qty: { type: DataTypes.INTEGER, allowNull: true, comment: "默认数量" },
      unit_price_usd: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "单价(USD)",
      },
      materials: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Materials",
      },
      country_of_origin: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: "原产国",
      },
      manufacturer: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Manufacture/Manufacturer",
      },
      total_boxes: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Total Boxes(默认)",
      },
      total_value_usd: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: "Total Value (USD)(默认)",
      },
      length_cm: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "长度(cm)",
      },
      width_cm: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "宽度(cm)",
      },
      height_cm: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "高度(cm)",
      },
      weight_kg: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: true,
        comment: "重量(kg)",
      },
      unit_system: {
        type: DataTypes.ENUM("metric", "imperial"),
        allowNull: true,
        comment: "录入时选择的单位体系（公制/英制）",
      },
    },
    {
      tableName: "item_templates",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["client_id"] },
        { fields: ["sku"] },
        // 唯一：同一客户下，名称不能重复
        {
          unique: true,
          fields: ["client_id", "product_name"],
          name: "uniq_client_product_name",
        },
      ],
    }
  );

  ItemTemplate.associate = (models) => {
    ItemTemplate.belongsTo(models.Customer, {
      foreignKey: "client_id",
      as: "client",
    });
  };

  return ItemTemplate;
};
