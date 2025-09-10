// scripts/setUserRole.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import db from "../models/index.js";

async function main() {
  const username = process.argv[2] || "agent_test";
  const roleName = process.argv[3] || "agent_manager";
  try {
    const user = await db.User.findOne({ where: { username } });
    if (!user) {
      console.error(`User not found: ${username}`);
      process.exit(1);
    }
    const role = await db.Role.findOne({ where: { name: roleName } });
    if (!role) {
      console.error(`Role not found: ${roleName}`);
      process.exit(1);
    }
    if (user.role_id === role.id) {
      console.log(`No change: ${username} already in role ${roleName}`);
      process.exit(0);
    }
    await user.update({ role_id: role.id });
    console.log(
      `✅ Updated ${username} -> role ${roleName} (role_id=${role.id})`
    );
    process.exit(0);
  } catch (e) {
    console.error("❌ Failed to update role:", e.message);
    process.exit(1);
  }
}

main();
