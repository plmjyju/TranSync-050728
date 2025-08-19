export default (sequelize, DataTypes) => {
  // 错误辅助: 统一前缀与代码
  const buildError = (code, message) => {
    const err = new Error(`[${code}] ${message}`);
    err.code = code;
    return err;
  };
  const Package = sequelize.define(
    "Package",
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      package_code: {
        type: DataTypes.STRING(40),
        allowNull: false,
        unique: true,
        comment: "包裹编号/箱唛号",
      },
      tracking_no: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "追踪号/运单号",
      },
      mawb: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "主运单号(Master Air Waybill)",
      },
      hawb: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "分运单号(House Air Waybill)",
      },
      inbond_id: {
        type: DataTypes.BIGINT,
        references: { model: "inbonds", key: "id" },
        allowNull: true,
      },
      forecast_id: {
        type: DataTypes.BIGINT,
        references: { model: "forecasts", key: "id" },
        allowNull: true,
      },
      pallet_id: {
        type: DataTypes.BIGINT,
        references: { model: "pallets", key: "id" },
        allowNull: true,
        comment: "所属航空板ID",
      },
      client_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      length_cm: DataTypes.FLOAT,
      width_cm: DataTypes.FLOAT,
      height_cm: DataTypes.FLOAT,
      weight_kg: DataTypes.FLOAT,
      split_action: {
        type: DataTypes.ENUM("direct", "split", "pickup"),
        defaultValue: "direct",
      },
      status: {
        type: DataTypes.ENUM(
          // 原有状态 (保留兼容)
          "prepared",
          "arrived",
          "sorted",
          "cleared",
          "stored",
          "damaged",
          "missing",
          "delivered",
          "in_transit",
          "incident",
          // 新增全流程细化状态
          "agent_received", // 货代入库
          "palletized", // 货代打板完成
          "mawb_filled", // AWB / MAWB 已填写
          "at_airline_warehouse", // 已到航司地仓
          "pickup_dispatched", // 已派司机取货
          "warehouse_received", // 已经入库（仓库确认接收）
          "split_processing", // 正在进行分板处理
          "split_completed", // 分板处理完成
          "outbound_dispatched" // 已经出库 / 发运
        ),
        defaultValue: "prepared",
        comment: "包裹业务主状态 (含旧+新枚举)",
      },
      // 新增: 清关状态（独立维度）
      clearance_status: {
        type: DataTypes.ENUM(
          "docs_insufficient", // 需要清关资料不足
          "clearing", // 正在清关
          "cleared_release", // 清关完成(放行)
          "clearance_failed", // 清关失败
          "awaiting_customs_inspection" // 等待海关检查
        ),
        allowNull: true,
        comment: "清关状态 (独立于业务主状态)",
      },
      clearance_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "清关备注/说明",
      },
      // 仓库位置信息
      warehouse_location: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "仓库位置（如：B-01-A-15）",
      },
      storage_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "入库时间",
      },
      storage_operator: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "入库操作员",
      },
      // 分板信息
      assigned_pallet_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "分配的板号",
      },
      // 新增: 原始地仓板号（拆板追溯）
      original_pallet_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "原始航空/地仓板号 (拆板追溯)",
      },
      // 入库阶段状态（与主业务 status 解耦）
      inbound_status: {
        type: DataTypes.ENUM("not_arrived", "arrived", "received"),
        allowNull: false,
        defaultValue: "not_arrived",
        comment: "入库阶段状态: 未到场/到场待收/已入库",
      },
      // 仓内分拣/重组进度
      sorting_status: {
        type: DataTypes.ENUM("pending", "classified", "repacked"),
        allowNull: false,
        defaultValue: "pending",
        comment: "分拣 / 重组状态",
      },
      remark: { type: DataTypes.TEXT },
      tax_type_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "tax_types", key: "id" },
      },
      // Arrival confirmation fields
      arrival_confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      arrival_confirmed_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      // 新增: 单一操作需求外键（由原多对多精简）
      operation_requirement_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "operation_requirements", key: "id" },
        comment: "单一操作需求ID (多对多降级后)",
      },
      // 交付/出库记录
      delivered_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "最终交付/出库时间",
      },
      delivered_operator_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "执行交付操作的用户ID",
      },
    },
    {
      tableName: "packages",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { fields: ["status"] },
        { fields: ["clearance_status"] },
        { fields: ["inbond_id"] },
        { fields: ["forecast_id"] },
        { fields: ["client_id"] },
        { fields: ["operation_requirement_id"] },
        { fields: ["inbound_status"] },
        { fields: ["sorting_status"] },
        { fields: ["original_pallet_number"] },
      ],
    }
  );

  // ========== 实用工具 & 约束 ==========
  // 计算体积（如需）: 可在查询时通过 raw: true 获取
  Object.defineProperty(Package.prototype, "volume_cm3", {
    get() {
      if (
        this.length_cm == null ||
        this.width_cm == null ||
        this.height_cm == null
      )
        return null;
      return this.length_cm * this.width_cm * this.height_cm;
    },
  });

  // 覆盖/替换原多对多的工具方法
  Package.prototype.getRequirementCodes = function () {
    // 兼容旧调用，返回单元素数组或空数组
    if (
      this.operationRequirement &&
      this.operationRequirement.requirement_code
    ) {
      return [this.operationRequirement.requirement_code];
    }
    return [];
  };

  Package.prototype.getRequirementCode = function () {
    return this.operationRequirement?.requirement_code || null;
  };

  // 新: 绑定单一 requirement_code
  Package.attachRequirementByCode = async function (
    pkg,
    requirementCode,
    { transaction } = {}
  ) {
    if (!requirementCode)
      throw buildError(
        "PKG_REQUIREMENT_CODE_MISSING",
        "operation_requirement_code 不能为空"
      );
    const { OperationRequirement } = sequelize.models;
    const opReq = await OperationRequirement.findOne({
      where: { requirement_code: requirementCode },
      transaction,
    });
    if (!opReq)
      throw buildError(
        "PKG_REQUIREMENT_CODE_INVALID",
        `无效的 operation_requirement_code: ${requirementCode}`
      );
    pkg.operation_requirement_id = opReq.id;
    await pkg.save({ transaction });
    return {
      id: opReq.id,
      requirement_code: opReq.requirement_code,
      requirement_name: opReq.requirement_name,
    };
  };

  // 兼容旧方法名（多参数将报错）
  Package.attachRequirementsByCodes = async function () {
    throw buildError(
      "PKG_REQUIREMENT_RELATION_CHANGED",
      "已改为单一操作需求，请使用 attachRequirementByCode(pkg, code)"
    );
  };

  // 限制：不是 prepared 状态时，禁止修改尺寸与重量等核心字段
  Package.addHook("beforeUpdate", (pkg) => {
    const protectedFields = [
      "length_cm",
      "width_cm",
      "height_cm",
      "weight_kg",
      "split_action",
    ];
    if (pkg.status !== "prepared") {
      const changedProtected = protectedFields.filter((f) => pkg.changed(f));
      if (changedProtected.length > 0) {
        throw buildError(
          "PKG_UPDATE_FORBIDDEN",
          `当前状态(${pkg.status})禁止修改字段: ${changedProtected.join(",")}`
        );
      }
    }
  });

  // 约束: 创建前必须有 operation_requirement_id
  Package.addHook("beforeValidate", (pkg) => {
    if (!pkg.operation_requirement_id) {
      throw buildError(
        "PKG_REQUIREMENT_ID_MISSING",
        "operation_requirement_id 不能为空 (单一操作需求)"
      );
    }
  });

  Package.associate = (models) => {
    Package.belongsTo(models.User, { foreignKey: "client_id", as: "client" });
    Package.belongsTo(models.Inbond, { foreignKey: "inbond_id", as: "inbond" });
    Package.belongsTo(models.Forecast, {
      foreignKey: "forecast_id",
      as: "forecast",
    });
    Package.belongsTo(models.Pallet, { foreignKey: "pallet_id", as: "pallet" });
    Package.belongsTo(models.TaxType, {
      foreignKey: "tax_type_id",
      as: "taxType",
    });
    Package.belongsTo(models.User, {
      foreignKey: "arrival_confirmed_by",
      as: "arrivalConfirmedBy",
    });
    Package.hasMany(models.PackageItem, {
      foreignKey: "package_id",
      as: "items",
    });
    Package.hasMany(models.PackageLog, {
      foreignKey: "package_id",
      as: "logs",
    });
    Package.belongsTo(models.PalletAllocation, {
      foreignKey: "assigned_pallet_number",
      targetKey: "pallet_number",
      as: "palletAllocation",
    });
    Package.belongsTo(models.OperationRequirement, {
      foreignKey: "operation_requirement_id",
      as: "operationRequirement",
    });
    Package.belongsTo(models.User, {
      foreignKey: "delivered_operator_id",
      as: "deliveredOperator",
    });

    // 原多对多已移除（保留历史中间表可单独查询）
  };

  return Package;
};
