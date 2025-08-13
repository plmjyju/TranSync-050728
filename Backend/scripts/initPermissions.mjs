import dotenv from "dotenv";
dotenv.config();

import db from "../models/index.js";
import { permissionsSeed } from "../seed/permissions.js";
import { rolesSeed } from "../seed/roles.js";

const { Permission, Role, RolePermission } = db;

async function initializeRolesAndPermissions() {
  try {
    console.log("🚀 开始初始化权限和角色数据...");

    // 1. 创建权限
    console.log("📝 创建权限数据...");
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
        console.log(`  ⏭️  权限已存在: ${permission.name}`);
      }
    }

    // 2. 创建角色
    console.log("👥 创建角色数据...");
    for (const roleData of rolesSeed) {
      const { permissions, ...roleInfo } = roleData;

      const [role, created] = await Role.findOrCreate({
        where: { name: roleInfo.name },
        defaults: roleInfo,
      });

      if (created) {
        console.log(`  ✅ 创建角色: ${role.name} - ${role.display_name}`);
      } else {
        console.log(`  ⏭️  角色已存在: ${role.name}`);
      }

      // 3. 分配权限给角色
      if (permissions && permissions.length > 0) {
        console.log(`  🔗 为角色 ${role.name} 分配权限...`);

        // 清除现有权限关联
        await RolePermission.destroy({
          where: { role_id: role.id },
        });

        // 添加新的权限关联
        for (const permissionName of permissions) {
          const permission = await Permission.findOne({
            where: { name: permissionName },
          });

          if (permission) {
            await RolePermission.create({
              role_id: role.id,
              permission_id: permission.id,
            });
            console.log(`    ✅ 分配权限: ${permissionName}`);
          } else {
            console.log(`    ❌ 权限不存在: ${permissionName}`);
          }
        }
      }
    }

    console.log("🎉 权限和角色初始化完成！");

    // 显示总结
    const totalPermissions = await Permission.count();
    const totalRoles = await Role.count();
    const totalRolePermissions = await RolePermission.count();

    console.log("\n📊 初始化总结:");
    console.log(`  权限总数: ${totalPermissions}`);
    console.log(`  角色总数: ${totalRoles}`);
    console.log(`  角色权限关联总数: ${totalRolePermissions}`);
  } catch (error) {
    console.error("❌ 初始化失败:", error);
  } finally {
    process.exit(0);
  }
}

// 运行初始化
initializeRolesAndPermissions();
