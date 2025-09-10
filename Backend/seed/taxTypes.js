import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import db from "../models/index.js";

// 加载 .env (与其它 seed 脚本保持一致)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const taxTypesData = [
  {
    name: "T06-T01",
    description: "Value Added Tax",
    taxRate: 0.13,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "T11",
    description: "Import customs duty",
    taxRate: 0.0,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "T06",
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
    console.log("[taxTypes] 开始创建税种类型...");
    const existingCount = await db.TaxType.count();
    if (existingCount > 0) {
      console.log(`[taxTypes] 已存在 ${existingCount} 个税种类型，跳过创建`);
      return;
    }
    const createdTaxTypes = await db.TaxType.bulkCreate(taxTypesData);
    console.log(`[taxTypes] 成功创建 ${createdTaxTypes.length} 个税种类型:`);
    createdTaxTypes.forEach((t) =>
      console.log(`  - ID:${t.id} 名称:${t.name} 税率:${t.taxRate}`)
    );
  } catch (error) {
    console.error("[taxTypes] 创建税种类型时出错:", error);
    throw error;
  }
};

// 直接执行判定 (兼容相对/绝对路径)
const invokedRaw = (process.argv[1] || "").replace(/\\/g, "/");
const thisFile = __filename.replace(/\\/g, "/");
if (thisFile === invokedRaw || thisFile.endsWith(invokedRaw)) {
  (async () => {
    try {
      await seedTaxTypes();
      console.log("[taxTypes] 税种类型创建完成");
      await db.sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error("[taxTypes] 执行失败:", error);
      await db.sequelize.close();
      process.exit(1);
    }
  })();
}
