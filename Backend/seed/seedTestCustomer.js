import bcrypt from "bcrypt";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import db from "../models/index.js";

// 加载 .env (与其它 seed 脚本保持一致)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

/*
 * 目的: 创建用于客户端登录测试的 Customer 账号 (adminAccount = client_test)
 * 要求字段: customerName, companyName, adminAccount, passwordHash(BCrypt), salesRepId, isActive
 * 幂等: 若已存在则只在必要时更新 passwordHash & isActive
 */
async function run() {
  const { Customer, sequelize } = db;
  let t;
  const username = "client_test";
  const plainPassword = "Test@12345";
  try {
    console.log("👤 开始创建测试客户 Customer...");
    t = await sequelize.transaction();

    // 查找现有记录
    let customer = await Customer.findOne({
      where: { adminAccount: username },
      transaction: t,
    });

    const hash = await bcrypt.hash(plainPassword, 10);
    if (!customer) {
      customer = await Customer.create(
        {
          customerName: "测试客户",
          companyName: "Test Client Co",
          contactName: "测试联系人",
          telephone: "000-0000",
          email: "client_test@example.com",
          address: "N/A",
          remark: "Seed test customer",
          adminAccount: username,
          passwordHash: hash,
          salesRepId: 1, // 如需关联真实销售代表请调整
          serviceRepId: null,
          accountManagerId: null,
          isActive: true,
        },
        { transaction: t }
      );
      console.log("  ✅ 新建客户: client_test");
    } else {
      const updates = {};
      if (!customer.isActive) updates.isActive = true;
      // 若你想每次强制重置密码可取消条件判断
      updates.passwordHash = hash;
      if (Object.keys(updates).length) {
        await customer.update(updates, { transaction: t });
        console.log("  🔄 已更新现有客户 (密码/状态)");
      } else {
        console.log("  ℹ️ 客户已存在且无需更新");
      }
    }

    await t.commit();
    console.log("\n登录凭据:");
    console.log(`  adminAccount: ${username}`);
    console.log(`  password    : ${plainPassword}`);
    console.log("\n⚠️ 仅供开发测试，勿用于生产");
    process.exit(0);
  } catch (e) {
    if (t) await t.rollback();
    console.error("❌ 创建测试客户失败:", e.message);
    process.exit(1);
  }
}

run();
