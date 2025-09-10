// 为 item_templates 表新增尺寸/重量/单位字段

export const up = async ({ context: qi, Sequelize }) => {
  // 尺寸/重量/单位
  await qi.addColumn("item_templates", "length_cm", {
    type: Sequelize.DECIMAL(10, 2),
    allowNull: true,
    comment: "长度(cm)",
    after: "total_value_usd",
  });
  await qi.addColumn("item_templates", "width_cm", {
    type: Sequelize.DECIMAL(10, 2),
    allowNull: true,
    comment: "宽度(cm)",
  });
  await qi.addColumn("item_templates", "height_cm", {
    type: Sequelize.DECIMAL(10, 2),
    allowNull: true,
    comment: "高度(cm)",
  });
  await qi.addColumn("item_templates", "weight_kg", {
    type: Sequelize.DECIMAL(12, 3),
    allowNull: true,
    comment: "重量(kg)",
  });
  await qi.addColumn("item_templates", "unit_system", {
    type: Sequelize.ENUM("metric", "imperial"),
    allowNull: true,
    comment: "录入时的单位体系",
  });
};

export const down = async ({ context: qi }) => {
  // 移除列（注意先删 ENUM 使用的列，再删 ENUM 类型）
  await qi.removeColumn("item_templates", "length_cm");
  await qi.removeColumn("item_templates", "width_cm");
  await qi.removeColumn("item_templates", "height_cm");
  await qi.removeColumn("item_templates", "weight_kg");
  await qi.removeColumn("item_templates", "unit_system");
  // ENUM 类型在部分方言不可直接删除，这里忽略
};
