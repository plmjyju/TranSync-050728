import bcrypt from "bcrypt";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import db from "../models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function run() {
  const { User, Role, sequelize } = db;
  let t;
  try {
    console.log("🔐 创建测试用户...");
    const password = "Test@12345";
    const hash = await bcrypt.hash(password, 10);
    t = await sequelize.transaction();

    const needRoles = ["super_admin", "agent_operator", "client_standard"];
    const roleMap = {};
    for (const rn of needRoles) {
      const r = await Role.findOne({ where: { name: rn }, transaction: t });
      if (!r) throw new Error(`缺少角色: ${rn}`);
      roleMap[rn] = r.id;
    }

    const plan = [
      { username: "admin_test", role: "super_admin", full: "管理员测试" },
      { username: "agent_test", role: "agent_operator", full: "货代测试" },
      { username: "client_test", role: "client_standard", full: "客户测试" },
    ];

    for (const p of plan) {
      const [user, created] = await User.findOrCreate({
        where: { username: p.username },
        defaults: {
          username: p.username,
          full_name: p.full,
          email: `${p.username}@example.com`,
          password_hash: hash,
          status: true,
          role_id: roleMap[p.role],
        },
        transaction: t,
      });
      if (!created && user.role_id !== roleMap[p.role]) {
        await user.update({ role_id: roleMap[p.role] }, { transaction: t });
      }
      console.log(`  用户: ${p.username} 角色:${p.role} 已存在:${!created}`);
    }

    await t.commit();
    console.log("\n登录凭据:");
    plan.forEach((p) => console.log(`  ${p.username} / ${password}`));
    console.log("\n⚠️ 开发测试账号，勿用于生产");
    process.exit(0);
  } catch (e) {
    if (t) await t.rollback();
    console.error("❌ 创建失败:", e.message);
    process.exit(1);
  }
}

run();
