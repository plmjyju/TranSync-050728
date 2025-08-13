// 权限和角色初始化脚本
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, "../.env") });

import db from "../models/index.js";
import { permissionsSeed } from "./permissions.js";
import { rolesSeed, generateRolePermissionsSeed } from "./roles.js";

const { Permission, Role, RolePermission } = db;

async function initializePermissionsAndRoles() {
  try {
    console.log("🚀 开始初始化权限和角色系统...");

    // 1. 同步权限数据
    console.log("📋 同步权限数据...");
    for (const permissionData of permissionsSeed) {
      const [permission, created] = await Permission.findOrCreate({
        where: { name: permissionData.name },
        defaults: permissionData,
      });

      if (created) {
        console.log(
          `  ✅ 创建权限: ${permission.name} - ${permission.display_name}`
        );
      } else {
        // 更新已存在的权限
        await permission.update(permissionData);
        console.log(
          `  🔄 更新权限: ${permission.name} - ${permission.display_name}`
        );
      }
    }

    // 2. 同步角色数据
    console.log("👥 同步角色数据...");
    for (const roleData of rolesSeed) {
      const [role, created] = await Role.findOrCreate({
        where: { name: roleData.name },
        defaults: {
          name: roleData.name,
          display_name: roleData.display_name,
          description: roleData.description,
        },
      });

      if (created) {
        console.log(`  ✅ 创建角色: ${role.name} - ${role.display_name}`);
      } else {
        // 更新已存在的角色
        await role.update({
          display_name: roleData.display_name,
          description: roleData.description,
        });
        console.log(`  🔄 更新角色: ${role.name} - ${role.display_name}`);
      }
    }

    // 3. 清理旧的角色权限关联
    console.log("🧹 清理旧的角色权限关联...");
    await RolePermission.destroy({ where: {} });

    // 4. 生成新的角色权限关联
    console.log("🔗 生成角色权限关联...");
    const allPermissions = await Permission.findAll();
    const rolePermissionsSeed = await generateRolePermissionsSeed(
      rolesSeed,
      allPermissions
    );

    // 批量插入角色权限关联
    const validRolePermissions = [];
    for (const rp of rolePermissionsSeed) {
      const role = await Role.findOne({ where: { name: rp.role_name } });
      const permission = await Permission.findOne({
        where: { name: rp.permission_name },
      });

      if (role && permission) {
        validRolePermissions.push({
          role_id: role.id,
          permission_id: permission.id,
        });
      } else {
        console.log(
          `  ⚠️  警告: 角色 ${rp.role_name} 或权限 ${rp.permission_name} 不存在`
        );
      }
    }

    if (validRolePermissions.length > 0) {
      await RolePermission.bulkCreate(validRolePermissions);
      console.log(`  ✅ 创建了 ${validRolePermissions.length} 个角色权限关联`);
    }

    // 5. 统计信息
    const totalPermissions = await Permission.count();
    const totalRoles = await Role.count();
    const totalRolePermissions = await RolePermission.count();

    console.log("\n📊 初始化完成统计:");
    console.log(`  权限总数: ${totalPermissions}`);
    console.log(`  角色总数: ${totalRoles}`);
    console.log(`  角色权限关联总数: ${totalRolePermissions}`);

    // 6. 显示各角色权限数量
    console.log("\n🔍 各角色权限分配情况:");
    for (const roleData of rolesSeed) {
      const role = await Role.findOne({
        where: { name: roleData.name },
        include: [{ model: Permission, as: "permissions" }],
      });
      if (role) {
        console.log(
          `  ${role.display_name} (${role.name}): ${role.permissions.length} 个权限`
        );
      }
    }

    console.log("\n🎉 权限和角色系统初始化完成!");
  } catch (error) {
    console.error("❌ 初始化失败:", error);
    throw error;
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  initializePermissionsAndRoles()
    .then(() => {
      console.log("✅ 脚本执行完成");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ 脚本执行失败:", error);
      process.exit(1);
    });
}

export { initializePermissionsAndRoles };
