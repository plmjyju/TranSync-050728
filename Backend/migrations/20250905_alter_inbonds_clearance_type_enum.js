// Alter inbonds.clearance_type to include new ENUM values: T01, T11, T06-T01
// Ensures backend can insert code-like clearance types without truncation errors.

export async function up({ context: queryInterface }) {
  const values = [
    // legacy values
    "general_trade",
    "bonded_warehouse",
    "cross_border_ecom",
    "personal_items",
    "samples",
    "temporary_import",
    "duty_free",
    "re_import",
    // new code values
    "T01",
    "T11",
    "T06-T01",
  ];
  const enumSql = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
  const sql = `ALTER TABLE inbonds MODIFY COLUMN clearance_type ENUM(${enumSql}) NOT NULL DEFAULT 'general_trade' COMMENT '清关类型/代码（兼容旧值 + 新增代码）'`;
  await queryInterface.sequelize.query(sql);
}

export async function down({ context: queryInterface }) {
  const values = [
    // revert to legacy only (no code values)
    "general_trade",
    "bonded_warehouse",
    "cross_border_ecom",
    "personal_items",
    "samples",
    "temporary_import",
    "duty_free",
    "re_import",
  ];
  const enumSql = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
  const sql = `ALTER TABLE inbonds MODIFY COLUMN clearance_type ENUM(${enumSql}) NOT NULL DEFAULT 'general_trade' COMMENT '清关类型（旧）'`;
  await queryInterface.sequelize.query(sql);
}
