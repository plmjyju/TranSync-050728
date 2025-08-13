// scripts/testTokenPermissions.mjs - 测试token权限系统
import dotenv from "dotenv";
dotenv.config();

import db from "../models/index.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const { User, Role, Permission, RolePermission } = db;

async function createTestUser() {
  try {
    console.log("🧪 创建测试用户...");

    // 查找或创建测试角色
    const testRole = await Role.findOne({ where: { name: "omp_manager" } });
    if (!testRole) {
      console.log("❌ 未找到omp_manager角色，请先运行权限初始化");
      return;
    }

    // 创建测试用户
    const hashedPassword = await bcrypt.hash("123456", 10);

    const [user, created] = await User.findOrCreate({
      where: { username: "testuser" },
      defaults: {
        username: "testuser",
        password_hash: hashedPassword,
        email: "test@example.com",
        status: true,
        role_id: testRole.id,
      },
    });

    if (created) {
      console.log("✅ 测试用户创建成功:", user.username);
    } else {
      console.log("⏭️ 测试用户已存在:", user.username);
      // 更新用户角色
      await user.update({ role_id: testRole.id });
    }

    console.log(
      `📋 用户信息: ID=${user.id}, 角色=${testRole.name}, 权限数量=待查询`
    );
    return user;
  } catch (error) {
    console.error("❌ 创建测试用户失败:", error);
  }
}

async function testTokenGeneration() {
  try {
    console.log("\n🚀 测试token生成...");

    // 模拟登录流程
    const user = await User.findOne({
      where: { username: "testuser" },
      include: [
        {
          model: Role,
          as: "role",
          include: [
            {
              model: Permission,
              as: "permissions",
              through: { attributes: [] },
            },
          ],
        },
      ],
    });

    if (!user || !user.role) {
      console.log("❌ 用户或角色不存在");
      return;
    }

    const permissions = user.role.permissions.map((p) => p.name);
    console.log(
      `📝 用户权限 (${permissions.length}个):`,
      permissions.slice(0, 5).join(", ") + "..."
    );

    // 生成新格式的token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        roleId: user.role.id,
        roleName: user.role.name,
        roleDisplayName: user.role.display_name,
        permissions: permissions,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    console.log("✅ Token生成成功");
    console.log("📄 Token (前50字符):", token.substring(0, 50) + "...");

    // 验证token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );
    console.log("✅ Token验证成功");
    console.log("📋 解码信息:", {
      id: decoded.id,
      username: decoded.username,
      role: decoded.roleName,
      permissionCount: decoded.permissions.length,
    });

    return token;
  } catch (error) {
    console.error("❌ Token测试失败:", error);
  }
}

async function testPermissionCheck(token) {
  try {
    console.log("\n🔍 测试权限检查...");

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );

    // 模拟权限检查
    const testPermissions = [
      "omp.access",
      "omp.forecast.view",
      "omp.user.manage",
      "warehouse.access", // 应该没有这个权限
      "invalid.permission", // 无效权限
    ];

    for (const permission of testPermissions) {
      const hasPermission = decoded.permissions.includes(permission);
      console.log(
        `${hasPermission ? "✅" : "❌"} ${permission}: ${
          hasPermission ? "通过" : "拒绝"
        }`
      );
    }
  } catch (error) {
    console.error("❌ 权限检查测试失败:", error);
  }
}

async function runTests() {
  console.log("🧪 开始token权限系统测试...\n");

  await createTestUser();
  const token = await testTokenGeneration();

  if (token) {
    await testPermissionCheck(token);
  }

  console.log("\n🎉 测试完成！");
  process.exit(0);
}

runTests();
