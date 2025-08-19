// Migration: add finalize flags to split_orders and internal move chain support
export async function up({ context: queryInterface, Sequelize }) {
  // add columns to split_orders
  await queryInterface.addColumn("split_orders", "finalize_in_progress", {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    after: "completed_at",
  });
  await queryInterface.addColumn("split_orders", "last_finalize_error", {
    type: Sequelize.TEXT,
    allowNull: true,
    after: "finalize_in_progress",
  });
  // extend enum for ftz_inventory_ledger.direction if not exists internal_move (MySQL specific)
  // Warning: direct ALTER TABLE CHANGE for ENUM
  // You may need to manually adjust depending on existing definition.
  await queryInterface.sequelize.query(
    "ALTER TABLE ftz_inventory_ledger MODIFY COLUMN direction ENUM('inbound','outbound','adjustment','reversal','internal_move') NOT NULL COMMENT '记录方向'"
  );
}

export async function down({ context: queryInterface, Sequelize }) {
  try {
    await queryInterface.removeColumn("split_orders", "last_finalize_error");
  } catch (e) {}
  try {
    await queryInterface.removeColumn("split_orders", "finalize_in_progress");
  } catch (e) {}
  // Revert enum (remove internal_move) - adjust if original set differs
  await queryInterface.sequelize.query(
    "ALTER TABLE ftz_inventory_ledger MODIFY COLUMN direction ENUM('inbound','outbound','adjustment','reversal') NOT NULL COMMENT '记录方向'"
  );
}
