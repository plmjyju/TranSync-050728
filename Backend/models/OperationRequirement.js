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
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "排序顺序",
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
    // 暂时禁用，等模型问题解决后再启用
    /*
    OperationRequirement.belongsToMany(models.Package, {
      through: models.PackageOperationRequirement,
      foreignKey: "operation_requirement_id",
      otherKey: "package_id",
      as: "packages",
    });
    */
  };

  return OperationRequirement;
};
