export default (sequelize, DataTypes) => {
  const InbondLog = sequelize.define(
    "InbondLog",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      inbond_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "inbonds", key: "id" },
        comment: "关联的Inbond记录ID",
      },
      operation_type: {
        type: DataTypes.ENUM(
          "created",
          "updated",
          "status_changed",
          "completed",
          "cancelled"
        ),
        allowNull: false,
        comment: "操作类型",
      },
      old_values: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "修改前的值（JSON格式）",
      },
      new_values: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "修改后的值（JSON格式）",
      },
      operation_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "操作原因/备注",
      },
      performed_by: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
        comment: "执行操作的用户ID",
      },
      performed_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: "操作时间",
      },
    },
    {
      tableName: "inbond_logs",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          fields: ["inbond_id"],
        },
        {
          fields: ["operation_type"],
        },
        {
          fields: ["performed_by"],
        },
        {
          fields: ["performed_at"],
        },
      ],
    }
  );

  InbondLog.associate = (models) => {
    InbondLog.belongsTo(models.Inbond, {
      foreignKey: "inbond_id",
      as: "inbond",
    });
    InbondLog.belongsTo(models.User, {
      foreignKey: "performed_by",
      as: "performer",
    });
  };

  return InbondLog;
};
