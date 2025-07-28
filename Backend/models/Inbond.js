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
      warehouse_id: { type: DataTypes.BIGINT, allowNull: false },
      shipping_type: { type: DataTypes.ENUM("air", "sea"), allowNull: false },
      arrival_method: { type: DataTypes.STRING(20) },
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
    Inbond.belongsTo(models.Warehouse, {
      foreignKey: "warehouse_id",
      as: "warehouse",
    });
    Inbond.hasMany(models.Package, { foreignKey: "inbond_id", as: "packages" });
  };

  return Inbond;
};
