// 为 item_templates 表新增 product_name，并添加 (client_id, product_name) 唯一索引

export const up = async ({ context: qi, Sequelize }) => {
  await qi.addColumn("item_templates", "product_name", {
    type: Sequelize.STRING(200),
    allowNull: true,
    comment: "物品名称",
    after: "client_id",
  });

  try {
    await qi.addIndex("item_templates", {
      name: "uniq_client_product_name",
      unique: true,
      fields: ["client_id", "product_name"],
    });
  } catch (e) {
    console.log(
      "Index uniq_client_product_name exists or cannot be created:",
      e.message
    );
  }
};

export const down = async ({ context: qi }) => {
  try {
    await qi.removeIndex("item_templates", "uniq_client_product_name");
  } catch {}
  await qi.removeColumn("item_templates", "product_name");
};
