import db from "../models/index.js";
import { pathToFileURL } from "url";

const { User, OperationRequirement, UserOperationRequirement } = db;

/*
  用法:
  - 仅绑定某个用户：
    node seed/seedUserOperationRequirements.js --user client_test --add S-USPS,F-USPS --selectable --enabled
    或者按ID：
    node seed/seedUserOperationRequirements.js --id 123
  - 为所有启用用户绑定所有启用的操作需求：
    node seed/seedUserOperationRequirements.js --all
  - 不带参数：保留原有行为，尝试绑定前两个用户 S-USPS/F-USPS
*/

function parseArgs(argv) {
  const args = {
    add: null,
    user: null,
    id: null,
    all: false,
    selectable: true,
    enabled: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") args.all = true;
    else if (a === "--selectable") args.selectable = true;
    else if (a === "--no-selectable") args.selectable = false;
    else if (a === "--enabled") args.enabled = true;
    else if (a === "--disabled") args.enabled = false;
    else if (a === "--user" && argv[i + 1]) args.user = argv[++i];
    else if (a === "--id" && argv[i + 1]) args.id = argv[++i];
    else if (a === "--add" && argv[i + 1]) args.add = argv[++i];
  }
  if (args.add)
    args.add = args.add
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return args;
}

async function bindForUsers(users, codes, selectable = true, enabled = true) {
  if (!users || users.length === 0) {
    console.log("无用户可绑定，跳过");
    return;
  }
  // 加载 OperationRequirements
  let opWhere;
  if (codes && codes.length > 0) {
    opWhere = { requirement_code: codes };
  } else {
    // 默认：绑定所有启用的操作需求，避免前端下拉选择后被后端拒绝
    opWhere = { is_active: true };
  }
  const reqList = await OperationRequirement.findAll({ where: opWhere });
  if (reqList.length === 0) {
    console.log("未找到可绑定的 OperationRequirement，检查种子数据");
    return;
  }
  const codeList = reqList.map((r) => r.requirement_code);
  console.log(
    `准备为 ${users.length} 个用户绑定 ${
      reqList.length
    } 个操作需求: ${codeList.join(",")}`
  );

  for (const u of users) {
    for (const r of reqList) {
      await UserOperationRequirement.findOrCreate({
        where: { user_id: u.id, operation_requirement_id: r.id },
        defaults: { is_selectable: selectable, is_enabled: enabled },
      });
    }
    console.log(`  用户(${u.id}:${u.username}) 绑定完成`);
  }
  console.log("用户 OperationRequirement 绑定完成");
}

async function seedUserOperationRequirements() {
  await db.sequelize.authenticate();
  const opts = parseArgs(process.argv);

  // 选择用户集合
  let users = [];
  if (opts.user) {
    users = await User.findAll({ where: { username: opts.user } });
    if (users.length === 0)
      users = await User.findAll({ where: { email: opts.user } });
  } else if (opts.id) {
    const idNum = parseInt(opts.id, 10);
    if (!Number.isNaN(idNum)) {
      const u = await User.findByPk(idNum);
      if (u) users = [u];
    }
  } else if (opts.all) {
    users = await User.findAll({
      where: { status: true },
      order: [["id", "ASC"]],
    });
  } else {
    // 兼容旧逻辑：取前两个用户
    users = await User.findAll({ limit: 2, order: [["id", "ASC"]] });
  }

  // 解析代码
  const codes = opts.add && opts.add.length > 0 ? opts.add : null; // null 表示全部 is_active

  await bindForUsers(users, codes, opts.selectable, opts.enabled);
}

// 兼容 Windows 的 ESM 主模块检测
const isMain = (() => {
  try {
    return (
      process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
    );
  } catch {
    return false;
  }
})();

if (isMain) {
  seedUserOperationRequirements()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

export default seedUserOperationRequirements;
