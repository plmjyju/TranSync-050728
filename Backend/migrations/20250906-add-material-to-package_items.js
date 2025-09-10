// 添加 material 字段到 package_items 表（Umzug v3 风格）

export const up = async ({ context: queryInterface, Sequelize }) => {
  await queryInterface.addColumn("package_items", "material", {
    type: Sequelize.STRING(200),
    allowNull: true,
    comment: "材质",
    after: "product_description",
  });
  // 可选索引：
  // await queryInterface.addIndex('package_items', ['material'], { name: 'idx_package_items_material' });
};

export const down = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn("package_items", "material");
};
