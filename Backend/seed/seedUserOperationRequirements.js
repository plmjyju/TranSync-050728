import db from "../models/index.js";

const { User, OperationRequirement, UserOperationRequirement } = db;

/*
  用法:
  node seed/seedUserOperationRequirements.js --user userEmailOrId --add SPLIT_USPS,SPLIT_UPS --selectable --visible
  简化：这里示例逻辑：
    - 找到第一个用户，给他绑定 SPLIT_USPS, FULL_USPS
    - 找到第二个用户（如果有），只绑定 SPLIT_USPS
*/

async function seedUserOperationRequirements() {
  await db.sequelize.authenticate();

  const users = await User.findAll({ limit: 2, order: [["id", "ASC"]] });
  if (users.length === 0) {
    console.log("无用户，跳过");
    return;
  }
  const reqMap = await OperationRequirement.findAll({
    where: { requirement_code: ["SPLIT_USPS", "FULL_USPS"] },
  });
  const byCode = Object.fromEntries(reqMap.map((r) => [r.requirement_code, r]));

  const u1 = users[0];
  if (byCode.SPLIT_USPS) {
    await UserOperationRequirement.findOrCreate({
      where: { user_id: u1.id, operation_requirement_id: byCode.SPLIT_USPS.id },
      defaults: { is_selectable: true, is_enabled: true },
    });
  }
  if (byCode.FULL_USPS) {
    await UserOperationRequirement.findOrCreate({
      where: { user_id: u1.id, operation_requirement_id: byCode.FULL_USPS.id },
      defaults: { is_selectable: true, is_enabled: true },
    });
  }

  if (users[1] && byCode.SPLIT_USPS) {
    await UserOperationRequirement.findOrCreate({
      where: {
        user_id: users[1].id,
        operation_requirement_id: byCode.SPLIT_USPS.id,
      },
      defaults: { is_selectable: true, is_enabled: true },
    });
  }

  console.log("用户 OperationRequirement 绑定完成");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  seedUserOperationRequirements()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

export default seedUserOperationRequirements;
