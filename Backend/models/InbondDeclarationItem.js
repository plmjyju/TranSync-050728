export default (sequelize, DataTypes) => {
  const InbondDeclarationItem = sequelize.define(
    "InbondDeclarationItem",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      inbond_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "inbonds", key: "id" },
        comment: "所属入库单ID",
      },
      client_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: "客户ID（Customer.id）",
      },
      sku: { type: DataTypes.STRING(100), allowNull: true },
      description_of_good: { type: DataTypes.STRING(500), allowNull: false },
      hs_code: { type: DataTypes.STRING(20), allowNull: true },
      qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      unit_price_usd: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      materials: { type: DataTypes.STRING(255), allowNull: true },
      country_of_origin: { type: DataTypes.STRING(10), allowNull: true },
      manufacturer: { type: DataTypes.STRING(200), allowNull: true },
      total_boxes: { type: DataTypes.INTEGER, allowNull: true },
      total_value_usd: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    },
    {
      tableName: "inbond_declaration_items",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["inbond_id"] },
        { fields: ["client_id"] },
        { fields: ["hs_code"] },
        { fields: ["sku"] },
      ],
    }
  );

  InbondDeclarationItem.associate = (models) => {
    InbondDeclarationItem.belongsTo(models.Inbond, {
      foreignKey: "inbond_id",
      as: "inbond",
    });
    InbondDeclarationItem.belongsTo(models.Customer, {
      foreignKey: "client_id",
      as: "client",
    });
  };

  return InbondDeclarationItem;
};
