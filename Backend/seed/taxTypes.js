import db from "../models/index.js";

const taxTypesData = [
  {
    name: "VAT",
    description: "Value Added Tax",
    taxRate: 0.13,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "Customs Duty",
    description: "Import customs duty",
    taxRate: 0.0,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Excise Tax",
    description: "Special excise tax",
    taxRate: 0.0,
    isActive: true,
    sortOrder: 3,
  },
  {
    name: "No Tax",
    description: "Tax-free items",
    taxRate: 0.0,
    isActive: true,
    sortOrder: 4,
  },
];

export const seedTaxTypes = async () => {
  try {
    console.log("开始创建税种类型...");

    // 检查是否已有数据
    const existingCount = await db.TaxType.count();
    if (existingCount > 0) {
      console.log(`已存在 ${existingCount} 个税种类型，跳过创建`);
      return;
    }

    // 批量创建税种类型
    const createdTaxTypes = await db.TaxType.bulkCreate(taxTypesData);
    console.log(`成功创建 ${createdTaxTypes.length} 个税种类型:`);

    createdTaxTypes.forEach((taxType) => {
      console.log(
        `- ID: ${taxType.id}, 名称: ${taxType.name}, 税率: ${taxType.taxRate}`
      );
    });
  } catch (error) {
    console.error("创建税种类型时出错:", error);
    throw error;
  }
};

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      await seedTaxTypes();
      console.log("税种类型创建完成");
      await db.sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error("执行失败:", error);
      await db.sequelize.close();
      process.exit(1);
    }
  })();
}
