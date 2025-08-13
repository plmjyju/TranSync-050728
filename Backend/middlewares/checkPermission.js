import db from "../models/index.js";
const { Role, Permission } = db;

const checkPermission = (permissionName) => {
  return async (req, res, next) => {
    const user = req.user;

    try {
      // 新的token方式：直接从token中验证权限
      if (user.permissions && Array.isArray(user.permissions)) {
        console.log(`🔍 权限检查: ${permissionName} - 从token验证`);

        if (user.permissions.includes(permissionName)) {
          console.log(`✅ 权限验证通过: ${permissionName}`);
          return next();
        } else {
          console.log(
            `❌ 权限验证失败: ${permissionName}, 用户权限: [${user.permissions
              .slice(0, 5)
              .join(", ")}...]`
          );
          return res.status(403).json({
            success: false,
            message: `权限不足：需要 '${permissionName}' 权限`,
            error_code: "PERMISSION_DENIED",
          });
        }
      }

      // 客户端用户兼容处理（旧的token方式）
      if (user.userType === "client") {
        const clientPermissions = [
          "client.access", // 客户端系统访问权限
          "client.dashboard.view",
          "client.forecast.view",
          "client.package.view",
          "client.package.edit",
          "client.package.track",
          "client.statistics.view",
          "client.invoice.view",
          "client.invoice.download", // VIP客户才有的权限需要角色控制
          "client.inbond.view",
          "client.inbond.create",
          "client.inbond.update",
        ];

        if (clientPermissions.includes(permissionName)) {
          return next();
        } else {
          return res.status(403).json({
            success: false,
            message: `权限不足：需要'${permissionName}'权限`,
            error_code: "PERMISSION_DENIED",
          });
        }
      }

      // 其他用户类型需要检查数据库权限
      if (!user.role_id) {
        return res.status(403).json({
          success: false,
          message: "用户未分配角色，无法访问系统",
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
          error_code: "ROLE_NOT_FOUND",
        });
      }

      // 检查是否有超级管理员权限（拥有所有权限）
      const isSuperAdmin = role.permissions.some(
        (p) => p.name === "*" || role.name === "super_admin"
      );

      if (isSuperAdmin) {
        return next();
      }

      // 检查具体权限
      const hasPermission = role.permissions.some(
        (p) => p.name === permissionName
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `权限不足：需要'${permissionName}'权限`,
          error_code: "PERMISSION_DENIED",
          user_role: role.display_name,
          required_permission: permissionName,
        });
      }

      // 权限检查通过，添加权限信息到请求对象
      req.userRole = role;
      req.userPermissions = role.permissions.map((p) => p.name);

      next();
    } catch (error) {
      console.error("权限检查错误:", error);
      return res.status(500).json({
        success: false,
        message: "权限检查失败",
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
        error_code: "PERMISSION_CHECK_ERROR",
      });
    }
  };
};

export default checkPermission;
export { checkPermission, checkMultiplePermissions, checkAnyPermission };
