export default (sequelize, DataTypes) => {
  const FtzInventoryLedgerOutbox = sequelize.define(
    "FtzInventoryLedgerOutbox",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      direction: {
        type: DataTypes.ENUM(
          "inbound",
          "outbound",
          "adjustment",
          "reversal",
          "internal_move"
        ),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "processing",
          "completed",
          "failed",
          "failed_permanent"
        ),
        defaultValue: "pending",
      },
      split_order_id: { type: DataTypes.BIGINT, allowNull: true },
      tenant_id: { type: DataTypes.BIGINT, allowNull: true },
      warehouse_id: { type: DataTypes.BIGINT, allowNull: true },
      attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
      last_error: { type: DataTypes.STRING(500), allowNull: true },
      next_retry_at: { type: DataTypes.DATE, allowNull: true },
      payload_json: { type: DataTypes.TEXT, allowNull: false }, // 存储序列化的最小化移动数据
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    },
    {
      tableName: "ftz_inventory_ledger_outbox",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["status"] },
        { fields: ["next_retry_at"] },
        { fields: ["tenant_id"] },
        { fields: ["warehouse_id"] },
        { fields: ["direction"] },
        { fields: ["split_order_id"] },
        {
          fields: ["status", "direction", "next_retry_at"],
          name: "idx_fil_outbox_status_dir_retry",
        },
      ],
    }
  );
  return FtzInventoryLedgerOutbox;
};
