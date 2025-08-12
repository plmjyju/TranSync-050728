export default (sequelize, DataTypes) => {
  const PackageItem = sequelize.define(
    "PackageItem",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      package_id: { type: DataTypes.BIGINT, allowNull: false },

      tracking_no: { type: DataTypes.STRING(50) },
      client_code: { type: DataTypes.STRING(50) },
      file_number: { type: DataTypes.STRING(100) },

      receiver_name: { type: DataTypes.STRING(100) },
      receiver_country: { type: DataTypes.STRING(10) },
      receiver_state: { type: DataTypes.STRING(10) },
      receiver_city: { type: DataTypes.STRING(100) },
      receiver_postcode: { type: DataTypes.STRING(20) },
      receiver_email: { type: DataTypes.STRING(100) },
      receiver_phone: { type: DataTypes.STRING(50) },
      receiver_address1: { type: DataTypes.STRING(255) },
      receiver_address2: { type: DataTypes.STRING(255) },

      sender_name: { type: DataTypes.STRING(100) },
      sender_country: { type: DataTypes.STRING(10) },
      sender_province: { type: DataTypes.STRING(100) },
      sender_city: { type: DataTypes.STRING(100) },
      sender_postcode: { type: DataTypes.STRING(20) },
      sender_address1: { type: DataTypes.STRING(255) },
      sender_address2: { type: DataTypes.STRING(255) },
      sender_license: { type: DataTypes.STRING(100) },
      sender_email: { type: DataTypes.STRING(100) },
      sender_phone: { type: DataTypes.STRING(50) },

      weight_kg: { type: DataTypes.DECIMAL(10, 3) },
      quantity: { type: DataTypes.INTEGER },
      length_cm: { type: DataTypes.INTEGER },
      width_cm: { type: DataTypes.INTEGER },
      height_cm: { type: DataTypes.INTEGER },

      hs_code: { type: DataTypes.STRING(20) },
      product_name_en: { type: DataTypes.STRING(200) },
      product_description: { type: DataTypes.STRING(500) },
      origin_country: { type: DataTypes.STRING(10) },
      url: { type: DataTypes.STRING(255) },

      unit_price: { type: DataTypes.DECIMAL(10, 2) },
      total_price: { type: DataTypes.DECIMAL(10, 2) },
      item_count: { type: DataTypes.INTEGER },

      is_fda: { type: DataTypes.BOOLEAN, defaultValue: false },
      manufacturer_mid: { type: DataTypes.STRING(100) },
      custom_note: { type: DataTypes.STRING(500) },

      // FTZ (自由贸易区) 出入口信息字段
      ftz_entry_port: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "FTZ入境口岸",
      },
      ftz_entry_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "FTZ入境日期",
      },
      ftz_entry_permit: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "FTZ入境许可证号",
      },
      ftz_customs_declaration: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "FTZ海关申报单号",
      },
      ftz_zone_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "FTZ自贸区代码",
      },
      ftz_bonded_warehouse: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "FTZ保税仓库代码",
      },
      ftz_regulatory_status: {
        type: DataTypes.ENUM("pending", "cleared", "bonded", "exempted"),
        allowNull: true,
        defaultValue: "pending",
        comment: "FTZ监管状态",
      },
      ftz_exit_port: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "FTZ出境口岸",
      },
      ftz_exit_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "FTZ出境日期",
      },
      ftz_exit_permit: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "FTZ出境许可证号",
      },
      ftz_duty_paid: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "已缴关税金额",
      },
      ftz_tax_paid: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "已缴税费金额",
      },

      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "package_items",
      timestamps: false,
    }
  );

  PackageItem.associate = (models) => {
    // ✅ 每个 item 属于一个包裹
    PackageItem.belongsTo(models.Package, {
      foreignKey: "package_id",
      as: "package",
    });
  };

  return PackageItem;
};
