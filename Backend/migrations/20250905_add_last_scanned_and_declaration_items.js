import { DataTypes } from "sequelize";

export async function up({ context: queryInterface, sequelize }) {
  // 1) packages 表新增 last_scanned_at
  await queryInterface.addColumn("packages", "last_scanned_at", {
    type: DataTypes.DATE,
    allowNull: true,
    comment: "最近一次扫描时间",
  });
  await queryInterface.addIndex("packages", ["last_scanned_at"], {
    name: "idx_pkg_last_scanned_at",
  });

  // 2) inbonds 表新增 clearance_summary_json, last_package_scan_at
  await queryInterface.addColumn("inbonds", "clearance_summary_json", {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "清关信息条目汇总(JSON)",
  });
  await queryInterface.addColumn("inbonds", "last_package_scan_at", {
    type: DataTypes.DATE,
    allowNull: true,
    comment: "该入库单下最后一次包裹扫描时间",
  });

  // 3) 新建 inbond_declaration_items 表
  await queryInterface.createTable("inbond_declaration_items", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    inbond_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: "inbonds", key: "id" },
    },
    client_id: { type: DataTypes.BIGINT, allowNull: false },
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
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.fn("NOW"),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.fn("NOW"),
    },
  });
  await queryInterface.addIndex("inbond_declaration_items", ["inbond_id"]);
  await queryInterface.addIndex("inbond_declaration_items", ["client_id"]);
  await queryInterface.addIndex("inbond_declaration_items", ["hs_code"]);
  await queryInterface.addIndex("inbond_declaration_items", ["sku"]);
}

export async function down({ context: queryInterface }) {
  await queryInterface
    .removeIndex("packages", "idx_pkg_last_scanned_at")
    .catch(() => {});
  await queryInterface
    .removeColumn("packages", "last_scanned_at")
    .catch(() => {});

  await queryInterface
    .removeColumn("inbonds", "clearance_summary_json")
    .catch(() => {});
  await queryInterface
    .removeColumn("inbonds", "last_package_scan_at")
    .catch(() => {});

  await queryInterface.dropTable("inbond_declaration_items").catch(() => {});
}
