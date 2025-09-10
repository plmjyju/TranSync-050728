export default (sequelize, DataTypes) => {
  const OperationRequirement = sequelize.define(
    "OperationRequirement",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      requirement_code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: "操作需求代码（如：PU, S-USPS, F-USPS, F-FDX）",
      },
      requirement_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "操作需求名称（如：自取、拆箱USPS、整箱USPS、整箱FedEx）",
      },
      requirement_name_en: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "操作需求英文名称",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "说明/备注",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "是否启用",
      },
      // 简化：仅保留处理模式 + 承运渠道 + 标签缩写
      handling_mode: {
        type: DataTypes.ENUM("pickup", "split", "full"),
        allowNull: false,
        comment: "处理模式：pickup(自取) / split(拆箱) / full(整箱)",
      },
      carrier: {
        type: DataTypes.ENUM(
          "USPS",
          "FEDEX",
          "UPS",
          "DHL",
          "LOCAL",
          "SELF",
          "OTHER"
        ),
        allowNull: true,
        comment: "承运渠道：USPS/FEDEX/UPS/DHL/LOCAL(本地)/SELF(自取)/OTHER",
      },
      label_abbr: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
        comment: "板唛号用缩写（如：PU, S-USPS, F-USPS, F-FDX）",
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "排序",
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "创建人ID",
      },
      updated_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment: "更新人ID",
      },
    },
    {
      tableName: "operation_requirements",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "uq_opreq_code", fields: ["requirement_code"], unique: true },
        { name: "uq_opreq_abbr", fields: ["label_abbr"], unique: true },
        { name: "idx_opreq_mode", fields: ["handling_mode"] },
        { name: "idx_opreq_carrier", fields: ["carrier"] },
        { name: "idx_opreq_active", fields: ["is_active"] },
        { name: "idx_opreq_sort", fields: ["sort_order"] },
      ],
      // 注意：如果数据库仍包含旧字段（distribution_mode、carrier_channel、is_client_visible 等），需要迁移脚本清理/映射
    }
  );

  OperationRequirement.associate = (models) => {
    OperationRequirement.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });
    OperationRequirement.belongsTo(models.User, {
      foreignKey: "updated_by",
      as: "updater",
    });

    // DEPRECATED: 原多对多 packages 关联已下线，改为 Package.operation_requirement_id 单一外键
    // OperationRequirement.belongsToMany(models.Package, { ... }) removed.

    OperationRequirement.hasMany(models.UserOperationRequirement, {
      foreignKey: "operation_requirement_id",
      as: "userBindings",
      onDelete: "CASCADE",
    });
    OperationRequirement.hasMany(models.CustomerOperationRequirement, {
      foreignKey: "operation_requirement_id",
      as: "customerBindings",
      onDelete: "CASCADE",
    });
  };

  // 简化校验/归一化
  OperationRequirement.addHook("beforeValidate", (req) => {
    // 统一缩写为大写、裁剪
    if (req.label_abbr) {
      req.label_abbr = String(req.label_abbr).trim().toUpperCase().slice(0, 10);
    }

    if (req.handling_mode === "pickup") {
      // 自取模式：carrier 统一为 SELF，默认缩写 PU
      req.carrier = "SELF";
      if (!req.label_abbr) req.label_abbr = "PU";
    } else if (req.handling_mode === "split" || req.handling_mode === "full") {
      // 拆箱/整箱需要指定实际承运渠道（不可为 SELF）
      if (!req.carrier || req.carrier === "SELF") {
        throw new Error(
          "split/full 模式需要有效的 carrier (USPS/FEDEX/UPS/DHL/LOCAL/OTHER)"
        );
      }
      if (!req.label_abbr) {
        const map = {
          USPS: "USPS",
          FEDEX: "FDX",
          UPS: "UPS",
          DHL: "DHL",
          LOCAL: "LC",
          OTHER: "OTH",
        };
        const c = map[req.carrier] || "OTH";
        req.label_abbr = `${req.handling_mode === "split" ? "S" : "F"}-${c}`;
      }
    }

    // 最终再次保证上限与大写
    req.label_abbr = String(req.label_abbr || "")
      .trim()
      .toUpperCase()
      .slice(0, 10);
  });

  return OperationRequirement;
};
