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
        comment: "操作需求代码（如：FRAGILE, UPRIGHT, COLD_CHAIN等）",
      },
      requirement_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "操作需求名称",
      },
      requirement_name_en: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "操作需求英文名称",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "详细描述和操作说明",
      },
      category: {
        type: DataTypes.ENUM(
          "handling", // 搬运要求
          "storage", // 存储要求
          "transport", // 运输要求
          "temperature", // 温度要求
          "security", // 安全要求
          "special", // 特殊要求
          "other" // 其他
        ),
        defaultValue: "handling",
        comment: "需求分类",
      },
      priority_level: {
        type: DataTypes.ENUM("low", "medium", "high", "critical"),
        defaultValue: "medium",
        comment: "优先级别",
      },
      icon_class: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "图标CSS类名",
      },
      color_code: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: "颜色代码（用于标识）",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "是否启用",
      },
      // 新增: 客户端可见 / 可选择 标记
      is_client_visible: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "客户端是否可见 (Client Portal 列表展示)",
      },
      is_client_selectable: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "客户端是否允许选择 (提交/绑定包裹时可选)",
      },
      client_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "给客户端展示的补充说明",
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "排序顺序",
      },
      // 新增: 拆板 / 分发模式（用于客户指示不同包裹走不同渠道）
      distribution_mode: {
        type: DataTypes.ENUM("split", "full", "pickup", "delivery", "other"),
        allowNull: true,
        comment:
          "分发模式: split(拆箱), full(整箱), pickup(卡派/自取), delivery(卡派/配送), other(其他)",
      },
      // 新增: 渠道 / 承运商
      carrier_channel: {
        type: DataTypes.ENUM(
          "USPS",
          "UPS",
          "FEDEX",
          "DHL",
          "LOCAL", // 本地配送 / 卡派
          "SELF", // 自取
          "OTHER"
        ),
        allowNull: true,
        comment: "承运渠道: USPS / UPS / FEDEX / DHL / LOCAL / SELF / OTHER",
      },
      // 新增: 配送目的地（仅 delivery 使用，内嵌字段）
      delivery_destination_type: {
        type: DataTypes.ENUM("region", "city", "zone", "hub", "other"),
        allowNull: true,
        comment:
          "配送目的地类型: region / city / zone / hub / other，仅在 delivery 模式下使用",
      },
      delivery_destination_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "配送目的地代码（如 CITY_LA, RGN_SZX）",
      },
      delivery_destination_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "配送目的地名称（展示）",
      },
      delivery_route_note: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "配送路线备注 / 说明",
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
        {
          fields: ["requirement_code"],
          unique: true,
        },
        {
          fields: ["category"],
        },
        {
          fields: ["is_active"],
        },
        {
          fields: ["sort_order"],
        },
        // 新增索引: 按模式快速筛选
        {
          fields: ["distribution_mode"],
        },
        {
          fields: ["carrier_channel"],
        },
        {
          fields: ["delivery_destination_type", "delivery_destination_code"],
        },
        // 为 delivery 唯一组合（MySQL 不支持部分索引，这里直接整体唯一，非 delivery 行两列都为空可重复）
        {
          unique: false,
          fields: [
            "distribution_mode",
            "delivery_destination_type",
            "delivery_destination_code",
          ],
        },
        { fields: ["is_client_visible"] },
        { fields: ["is_client_selectable"] },
      ],
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

    // 关联Package（多对多关系）
    OperationRequirement.belongsToMany(models.Package, {
      through: models.PackageOperationRequirement,
      foreignKey: "operation_requirement_id",
      otherKey: "package_id",
      as: "packages",
    });
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

  // 钩子：可加入简单校验（不强制，业务层也应校验）
  OperationRequirement.addHook("beforeValidate", (req) => {
    if (req.distribution_mode === "delivery") {
      if (!req.delivery_destination_name) {
        throw new Error("delivery 模式需要 delivery_destination_name");
      }
    } else {
      // 非 delivery 清空目的地字段，避免脏数据
      req.delivery_destination_type = null;
      req.delivery_destination_code = null;
      req.delivery_destination_name = null;
      req.delivery_route_note = null;
    }
    if (["split", "full"].includes(req.distribution_mode)) {
      if (!req.carrier_channel) {
        throw new Error(`${req.distribution_mode} 模式需要 carrier_channel`);
      }
    }
    if (req.distribution_mode === "pickup") {
      if (req.carrier_channel && req.carrier_channel !== "SELF") {
        throw new Error("pickup 模式 carrier_channel 只能为 SELF 或留空");
      }
      req.carrier_channel = "SELF"; // 统一规范
    }
    // 额外：如果不可见则不可选择
    if (req.is_client_selectable && !req.is_client_visible) {
      req.is_client_visible = true; // 自动矫正，或抛错： throw new Error("不可见的需求不能设为可选择");
    }
  });

  return OperationRequirement;
};
