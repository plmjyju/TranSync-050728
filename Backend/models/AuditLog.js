export default (sequelize, DataTypes) => {
  const AuditLog = sequelize.define(
    "AuditLog",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      module: { type: DataTypes.STRING(30), allowNull: false }, // client/agent/omp/wms
      entity_type: { type: DataTypes.STRING(40), allowNull: false },
      entity_id: { type: DataTypes.BIGINT, allowNull: false },
      action: { type: DataTypes.STRING(40), allowNull: false },
      user_id: { type: DataTypes.BIGINT, allowNull: true },
      user_type: { type: DataTypes.STRING(20), allowNull: true },
      before_json: { type: DataTypes.TEXT, allowNull: true },
      after_json: { type: DataTypes.TEXT, allowNull: true },
      extra_json: { type: DataTypes.TEXT, allowNull: true },
      ip: { type: DataTypes.STRING(64), allowNull: true },
      ua: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: "audit_logs",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
      indexes: [
        { fields: ["module", "entity_type", "entity_id"] },
        { fields: ["user_id"] },
        { fields: ["created_at"] },
      ],
    }
  );
  return AuditLog;
};
