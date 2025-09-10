import db from "../models/index.js";
import { getRedis } from "../utils/redisClient.js";
const { Role, Permission } = db;

async function getRolePermissionsCached(roleId) {
  const cacheKey = `perm:role:${roleId}`;
  try {
    const r = await getRedis();
    const cached = await r.get(cacheKey);
    if (cached) return JSON.parse(cached);
    const role = await Role.findByPk(roleId, {
      include: [{ model: Permission, as: "permissions" }],
    });
    if (!role) return null;
    const perms = role.permissions.map((p) => p.name);
    await r.set(
      cacheKey,
      JSON.stringify({
        roleName: role.name,
        displayName: role.display_name || role.name,
        permissions: perms,
        super: perms.includes("*") || role.name === "super_admin",
      }),
      { EX: 300 } // 5 min TTL
    );
    return {
      roleName: role.name,
      displayName: role.display_name || role.name,
      permissions: perms,
      super: perms.includes("*") || role.name === "super_admin",
    };
  } catch (e) {
    // fallback to db without cache
    const role = await Role.findByPk(roleId, {
      include: [{ model: Permission, as: "permissions" }],
    });
    if (!role) return null;
    const perms = role.permissions.map((p) => p.name);
    return {
      roleName: role.name,
      displayName: role.display_name || role.name,
      permissions: perms,
      super: perms.includes("*") || role.name === "super_admin",
    };
  }
}

const checkPermission = (permissionName) => {
  return async (req, res, next) => {
    const user = req.user;

    try {
      // 新的token方式：仅当 token.permissions 为非空数组时才直接使用
      if (
        user.permissions &&
        Array.isArray(user.permissions) &&
        user.permissions.length > 0
      ) {
        console.log(`🔍 权限检查: ${permissionName} - 从token验证`);

        if (user.permissions.includes(permissionName)) {
          console.log(`✅ 权限验证通过: ${permissionName}`);
          return next();
        } else {
          console.log(
            `❌ 权限验证失败: ${permissionName}, 用户权限: [${user.permissions
              .slice(0, 5)
              .join(", ")}]`
          );
          return res.status(403).json({
            success: false,
            message: `权限不足：需要 '${permissionName}' 权限`,
            code: "PERMISSION_DENIED",
            error_code: "PERMISSION_DENIED",
            required_permission: permissionName,
          });
        }
      }

      // 客户端用户兼容处理（旧的/无权限数组的token）
      if (user.userType === "client") {
        const clientPermissions = [
          "client.access",
          "client.dashboard.view",
          "client.forecast.view",
          "client.package.view",
          // 细粒度包裹权限（routes/client/package.js）
          "client.package.create",
          "client.package.update",
          "client.package.delete",
          "client.package.item.add",
          "client.package.item.view",
          // 新增：包裹明细更新/删除
          "client.package.item.update",
          "client.package.item.delete",
          // 兼容历史
          "client.package.edit",
          "client.package.track",
          "client.statistics.view",
          "client.invoice.view",
          "client.invoice.download",
          // 入仓单权限（routes/client/inbond.js）
          "client.inbond.view",
          "client.inbond.create",
          "client.inbond.update",
        ];

        if (clientPermissions.includes(permissionName)) {
          return next();
        } else {
          return res.status(403).json({
            success: false,
            message: `权限不足：需要 '${permissionName}' 权限`,
            code: "PERMISSION_DENIED",
            error_code: "PERMISSION_DENIED",
            required_permission: permissionName,
          });
        }
      }

      // 其他用户类型需要检查缓存/数据库权限
      if (!user.role_id && !user.roleId) {
        return res.status(403).json({
          success: false,
          message: "用户未分配角色，无法访问系统",
          code: "NO_ROLE_ASSIGNED",
          error_code: "NO_ROLE_ASSIGNED",
        });
      }

      const roleId = user.role_id || user.roleId; // 兼容不同字段
      const cached = await getRolePermissionsCached(roleId);
      if (!cached) {
        return res.status(403).json({
          success: false,
          message: "用户角色不存在",
          code: "ROLE_NOT_FOUND",
          error_code: "ROLE_NOT_FOUND",
        });
      }
      if (cached.super || cached.permissions.includes(permissionName)) {
        req.userRole = {
          name: cached.roleName,
          display_name: cached.displayName,
        };
        req.userPermissions = cached.permissions;
        return next();
      }

      return res.status(403).json({
        success: false,
        message: `权限不足：需要 '${permissionName}' 权限`,
        code: "PERMISSION_DENIED",
        error_code: "PERMISSION_DENIED",
        user_role: cached.displayName,
        required_permission: permissionName,
      });
    } catch (error) {
      console.error("权限检查错误:", error);
      return res.status(500).json({
        success: false,
        message: "权限检查失败",
        code: "PERMISSION_CHECK_ERROR",
        error_code: "PERMISSION_CHECK_ERROR",
      });
    }
  };
};

// 检查多个权限（需要同时拥有所有权限）
const checkMultiplePermissions = (permissions) => {
  return async (req, res, next) => {
    const user = req.user;

    try {
      if (!user.role_id) {
        return res.status(403).json({
          success: false,
          message: "用户未分配角色",
          code: "NO_ROLE_ASSIGNED",
          error_code: "NO_ROLE_ASSIGNED",
        });
      }

      const role = await Role.findByPk(user.role_id, {
        include: [{ model: Permission, as: "permissions" }],
      });

      if (!role) {
        return res.status(403).json({
          success: false,
          message: "用户角色不存在",
          code: "ROLE_NOT_FOUND",
          error_code: "ROLE_NOT_FOUND",
        });
      }

      // 检查是否有超级管理员权限
      const isSuperAdmin = role.permissions.some(
        (p) => p.name === "*" || role.name === "super_admin"
      );

      if (isSuperAdmin) {
        return next();
      }

      const userPermissions = role.permissions.map((p) => p.name);
      const missingPermissions = permissions.filter(
        (p) => !userPermissions.includes(p)
      );

      if (missingPermissions.length > 0) {
        return res.status(403).json({
          success: false,
          message: `权限不足：缺少权限 ${missingPermissions.join(", ")}`,
          code: "MULTIPLE_PERMISSIONS_DENIED",
          error_code: "MULTIPLE_PERMISSIONS_DENIED",
          missing_permissions: missingPermissions,
        });
      }

      req.userRole = role;
      req.userPermissions = userPermissions;
      next();
    } catch (error) {
      console.error("多重权限检查错误:", error);
      return res.status(500).json({
        success: false,
        message: "权限检查失败",
        code: "PERMISSION_CHECK_ERROR",
        error_code: "PERMISSION_CHECK_ERROR",
      });
    }
  };
};

// 检查任一权限（只需要拥有其中一个权限）
const checkAnyPermission = (permissions) => {
  return async (req, res, next) => {
    const user = req.user;

    try {
      if (!user.role_id) {
        return res.status(403).json({
          success: false,
          message: "用户未分配角色",
          code: "NO_ROLE_ASSIGNED",
          error_code: "NO_ROLE_ASSIGNED",
        });
      }

      const role = await Role.findByPk(user.role_id, {
        include: [{ model: Permission, as: "permissions" }],
      });

      if (!role) {
        return res.status(403).json({
          success: false,
          message: "用户角色不存在",
          code: "ROLE_NOT_FOUND",
          error_code: "ROLE_NOT_FOUND",
        });
      }

      // 检查是否有超级管理员权限
      const isSuperAdmin = role.permissions.some(
        (p) => p.name === "*" || role.name === "super_admin"
      );

      if (isSuperAdmin) {
        return next();
      }

      const userPermissions = role.permissions.map((p) => p.name);
      const hasAnyPermission = permissions.some((p) =>
        userPermissions.includes(p)
      );

      if (!hasAnyPermission) {
        return res.status(403).json({
          success: false,
          message: `权限不足：需要以下权限之一 ${permissions.join(", ")}`,
          code: "ANY_PERMISSION_DENIED",
          error_code: "ANY_PERMISSION_DENIED",
          required_permissions: permissions,
        });
      }

      req.userRole = role;
      req.userPermissions = userPermissions;
      next();
    } catch (error) {
      console.error("任一权限检查错误:", error);
      return res.status(500).json({
        success: false,
        message: "权限检查失败",
        code: "PERMISSION_CHECK_ERROR",
        error_code: "PERMISSION_CHECK_ERROR",
      });
    }
  };
};

export default checkPermission;
export { checkPermission, checkMultiplePermissions, checkAnyPermission };
