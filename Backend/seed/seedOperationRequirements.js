import db from "../models/index.js";
import defaultRequirements from "./operation-requirements.js";

const { OperationRequirement } = db;

async function seedOperationRequirements() {
  try {
    console.log("开始初始化操作需求选项...");

    // 检查是否已经有数据
    const existingCount = await OperationRequirement.count();
    if (existingCount > 0) {
      console.log(`已存在 ${existingCount} 个操作需求选项，跳过初始化`);
      return;
    }

    // 批量创建默认操作需求
    const created = await OperationRequirement.bulkCreate(defaultRequirements, {
      ignoreDuplicates: true,
    });

    console.log(`✅ 成功创建 ${created.length} 个默认操作需求选项`);

    // 显示创建的选项
    defaultRequirements.forEach((req, index) => {
      console.log(
        `${index + 1}. ${req.requirement_code} - ${req.requirement_name}`
      );
    });
  } catch (error) {
    console.error("❌ 初始化操作需求选项失败:", error);
    throw error;
  }
}

// 如果直接运行此文件，则执行初始化
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await db.sequelize.sync({ alter: true });
    await seedOperationRequirements();
    console.log("操作需求选项初始化完成");
    process.exit(0);
  } catch (error) {
    console.error("初始化失败:", error);
    process.exit(1);
  }
}

export default seedOperationRequirements;
