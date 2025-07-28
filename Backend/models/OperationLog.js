// 📦 客户 → 货代（Inbond 阶段）
// inbond.created 客户创建 Inbond 预报单

// inbond.accepted 货代确认接收

// package.arrived 包裹到货记录

// ✈️ 货代打板 & 出货（Forecast 阶段）
// pallet.created 打航空板

// forecast.created 创建 Forecast（提单/航班信息）

// forecast.mawb_assigned 填写 MAWB

// forecast.departed 起飞时间记录

// 🛬 航班落地 & 提货
// forecast.landed 航班落地

// forecast.truck_assigned 安排司机提货

// forecast.warehouse_arrived 到仓记录时间

// 🏗️ 拆板 & 分货
// pallet.unloaded 拆板完成

// package.sorted 分货打板完毕（可记录 pallet.id）

// 🚚 客户提货
// package.picked_up 客户提货完成，记录时间

// 1️⃣ models/OperationLog.js
export default (sequelize, DataTypes) => {
  const OperationLog = sequelize.define(
    "OperationLog",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      actor_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      client_type: {
        type: DataTypes.ENUM("omp", "wms", "agent", "client"),
        allowNull: false,
      },
      target_type: {
        type: DataTypes.ENUM("inbond", "forecast", "pallet", "package", "user"),
        allowNull: false,
      },
      target_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      inbond_code: { type: DataTypes.STRING(50) },
      forecast_code: { type: DataTypes.STRING(50) },
      pallet_code: { type: DataTypes.STRING(50) },
      package_code: { type: DataTypes.STRING(50) },
      action: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      remark: {
        type: DataTypes.TEXT,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "operation_logs",
      timestamps: false,
    }
  );

  OperationLog.associate = (models) => {
    OperationLog.belongsTo(models.User, {
      foreignKey: "actor_id",
      as: "actor",
    });
  };

  return OperationLog;
};
