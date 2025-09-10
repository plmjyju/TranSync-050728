import db from "../models/index.js";
import config from "../config/environment.js"; // 统一环境加载
import { applyScopeToWhere } from "../utils/scope.js";

async function run() {
  const agentUsername = process.argv[2] || "agent_test";
  const clientAdmin = process.argv[3] || "client_test";
  try {
    const agent = await db.User.findOne({ where: { username: agentUsername } });
    if (!agent) {
      console.error(`Agent user not found: ${agentUsername}`);
      process.exit(1);
    }

    // 从代理用户继承作用域（若模型/字段存在则生效）
    const scopeUser = {
      tenant_id: agent.tenant_id || agent.tenantId || null,
      warehouse_id: agent.warehouse_id || agent.warehouseId || null,
    };

    const whereCustomer = applyScopeToWhere(
      { adminAccount: clientAdmin },
      db.Customer,
      scopeUser
    );
    const customer = await db.Customer.findOne({ where: whereCustomer });
    if (!customer) {
      console.error(`Customer not found or out of scope: ${clientAdmin}`);
      process.exit(1);
    }
    const before = customer.salesRepId;
    if (customer.salesRepId !== agent.id) {
      await customer.update({ salesRepId: agent.id });
      console.log(
        `✅ Bound customer '${clientAdmin}' (id=${customer.id}) to agent '${agentUsername}' (id=${agent.id}). Before=${before}, After=${agent.id}`
      );
      if (scopeUser.tenant_id || scopeUser.warehouse_id) {
        console.log(
          `↳ scope tenant_id=${scopeUser.tenant_id ?? "-"}, warehouse_id=${
            scopeUser.warehouse_id ?? "-"
          }`
        );
      }
    } else {
      console.log(
        `ℹ️ Customer already bound to agent. salesRepId=${customer.salesRepId}`
      );
    }
    process.exit(0);
  } catch (e) {
    console.error("❌ Failed to bind:", e.message);
    process.exit(1);
  }
}

run();
