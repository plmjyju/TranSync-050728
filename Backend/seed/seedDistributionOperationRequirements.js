import db from "../models/index.js";
import distributionRequirements from "./distribution-operation-requirements.js";

const { OperationRequirement } = db;

async function seedDistributionOperationRequirements() {
  console.log("开始插入分发 / 配送相关 OperationRequirement 预置数据...");
  for (const req of distributionRequirements) {
    const exists = await OperationRequirement.findOne({
      where: { requirement_code: req.requirement_code },
    });
    if (exists) {
      console.log(`跳过 (已存在): ${req.requirement_code}`);
      continue;
    }
    await OperationRequirement.create(req);
    console.log(`创建: ${req.requirement_code}`);
  }
  console.log("完成分发 / 配送相关 OperationRequirement 预置数据插入");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await db.sequelize.authenticate();
    await seedDistributionOperationRequirements();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

export default seedDistributionOperationRequirements;
