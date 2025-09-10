// Migration: create ftz_inventory_ledger_outbox table for ledger write outbox
export async function up({ context: queryInterface, Sequelize }) {
  await queryInterface.createTable("ftz_inventory_ledger_outbox", {
    id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
    direction: {
      type: Sequelize.ENUM(
        "inbound",
        "outbound",
        "adjustment",
        "reversal",
        "internal_move"
      ),
      allowNull: false,
      comment: "记录方向",
    },
    status: {
      type: Sequelize.ENUM("pending", "processing", "completed", "failed"),
      allowNull: false,
      defaultValue: "pending",
      comment: "Outbox 状态",
    },
    split_order_id: { type: Sequelize.BIGINT, allowNull: true },
    tenant_id: { type: Sequelize.BIGINT, allowNull: true },
    warehouse_id: { type: Sequelize.BIGINT, allowNull: true },
    attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    last_error: { type: Sequelize.STRING(500), allowNull: true },
    next_retry_at: { type: Sequelize.DATE, allowNull: true },
    payload_json: { type: Sequelize.TEXT, allowNull: false },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("NOW"),
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("NOW"),
    },
  });

  await queryInterface.addIndex("ftz_inventory_ledger_outbox", ["status"], {
    name: "idx_fil_outbox_status",
  });
  await queryInterface.addIndex(
    "ftz_inventory_ledger_outbox",
    ["next_retry_at"],
    { name: "idx_fil_outbox_next_retry" }
  );
  await queryInterface.addIndex("ftz_inventory_ledger_outbox", ["tenant_id"], {
    name: "idx_fil_outbox_tenant",
  });
  await queryInterface.addIndex(
    "ftz_inventory_ledger_outbox",
    ["warehouse_id"],
    { name: "idx_fil_outbox_wh" }
  );
  await queryInterface.addIndex("ftz_inventory_ledger_outbox", ["direction"], {
    name: "idx_fil_outbox_direction",
  });
  await queryInterface.addIndex(
    "ftz_inventory_ledger_outbox",
    ["split_order_id"],
    { name: "idx_fil_outbox_split" }
  );
  // Composite index to accelerate worker scan
  await queryInterface.addIndex(
    "ftz_inventory_ledger_outbox",
    ["status", "next_retry_at"],
    { name: "idx_fil_outbox_status_retry" }
  );
}

export async function down({ context: queryInterface, Sequelize }) {
  try {
    await queryInterface.dropTable("ftz_inventory_ledger_outbox");
  } catch (e) {}
  // ENUM cleanup left intentionally (shared with other tables) - optional manual revert
}
