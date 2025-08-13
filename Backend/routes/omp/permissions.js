// 权限管理API路由
import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import {
  checkPermission,
  checkMultiplePermissions,
} from "../../middlewares/checkPermission.js";
import { asyncHandler } from "../../middlewares/errorHandler.js";
import { initializePermissionsAndRoles } from "../../seed/initPermissionsAndRoles.js";

const { User, Role, Permission, RolePermission } = db;
const router = express.Router();

// ========== 权限管理 ==========

// 获取所有权限列表
router.get(
  "/permissions",
  authenticate,
  checkPermission("permission.view"),
  asyncHandler(async (req, res) => {
    const { module, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (module) whereClause.module = module;

    const { count, rows: permissions } = await Permission.findAndCountAll({
      where: whereClause,
      order: [
        ["module", "ASC"],
        ["name", "ASC"],
      ],
      limit: parseInt(limit),
      offset,
    });

    // 按模块分组
    const groupedPermissions = permissions.reduce((acc, permission) => {
      if (!acc[permission.module]) {
        acc[permission.module] = [];
      }
      acc[permission.module].push(permission);
      return acc;
    }, {});

    res.json({
      success: true,
      message: "获取权限列表成功",
      data: {
        permissions: groupedPermissions,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      },
    });
  })
);

// 获取所有模块列表
router.get(
  "/permissions/modules",
  authenticate,
  checkPermission("permission.view"),
  asyncHandler(async (req, res) => {
    const modules = await Permission.findAll({
      attributes: ["module"],
      group: ["module"],
      order: [["module", "ASC"]],
    });

    res.json({
      success: true,
      message: "获取模块列表成功",
      data: modules.map((m) => m.module),
    });
  })
);

// ========== 角色管理 ==========

// 获取所有角色列表
router.get(
  "/roles",
  authenticate,
  checkPermission("role.view"),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: roles } = await Role.findAndCountAll({
      include: [
        {
          model: Permission,
          as: "permissions",
          attributes: ["id", "name", "display_name", "module"],
        },
      ],
      order: [["created_at", "ASC"]],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      success: true,
      message: "获取角色列表成功",
      data: {
        roles: roles.map((role) => ({
          ...role.toJSON(),
          permissions_count: role.permissions.length,
        })),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      },
    });
  })
);

// 获取角色详情（包含权限）
router.get(
  "/roles/:id",
  authenticate,
  checkPermission("role.view"),
  asyncHandler(async (req, res) => {
    const role = await Role.findByPk(req.params.id, {
      include: [
        {
          model: Permission,
          as: "permissions",
          attributes: ["id", "name", "display_name", "module"],
        },
      ],
    });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: "角色不存在",
      });
    }

    res.json({
      success: true,
      message: "获取角色详情成功",
      data: role,
    });
  })
);

// 创建角色
router.post(
  "/roles",
  authenticate,
  checkPermission("role.create"),
  asyncHandler(async (req, res) => {
    const { name, display_name, description, permission_ids = [] } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({
        success: false,
        message: "角色名称和显示名称不能为空",
      });
    }

    // 检查角色名是否已存在
    const existingRole = await Role.findOne({ where: { name } });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: "角色名称已存在",
      });
    }

    const transaction = await db.sequelize.transaction();

    try {
      // 创建角色
      const role = await Role.create(
        {
          name,
          display_name,
          description,
        },
        { transaction }
      );

      // 分配权限
      if (permission_ids.length > 0) {
        const rolePermissions = permission_ids.map((permission_id) => ({
          role_id: role.id,
          permission_id,
        }));
        await RolePermission.bulkCreate(rolePermissions, { transaction });
      }

      await transaction.commit();

      // 获取完整的角色信息
      const newRole = await Role.findByPk(role.id, {
        include: [
          {
            model: Permission,
            as: "permissions",
            attributes: ["id", "name", "display_name", "module"],
          },
        ],
      });

      res.status(201).json({
        success: true,
        message: "创建角色成功",
        data: newRole,
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  })
);

// 更新角色
router.put(
  "/roles/:id",
  authenticate,
  checkPermission("role.edit"),
  asyncHandler(async (req, res) => {
    const { display_name, description, permission_ids } = req.body;

    const role = await Role.findByPk(req.params.id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "角色不存在",
      });
    }

    const transaction = await db.sequelize.transaction();

    try {
      // 更新角色基本信息
      if (display_name !== undefined) role.display_name = display_name;
      if (description !== undefined) role.description = description;
      await role.save({ transaction });

      // 更新权限分配
      if (permission_ids !== undefined) {
        // 删除现有权限关联
        await RolePermission.destroy({
          where: { role_id: role.id },
          transaction,
        });

        // 创建新的权限关联
        if (permission_ids.length > 0) {
          const rolePermissions = permission_ids.map((permission_id) => ({
            role_id: role.id,
            permission_id,
          }));
          await RolePermission.bulkCreate(rolePermissions, { transaction });
        }
      }

      await transaction.commit();

      // 获取更新后的角色信息
      const updatedRole = await Role.findByPk(role.id, {
        include: [
          {
            model: Permission,
            as: "permissions",
            attributes: ["id", "name", "display_name", "module"],
          },
        ],
      });

      res.json({
        success: true,
        message: "更新角色成功",
        data: updatedRole,
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  })
);

// 删除角色
router.delete(
  "/roles/:id",
  authenticate,
  checkPermission("role.delete"),
  asyncHandler(async (req, res) => {
    const role = await Role.findByPk(req.params.id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "角色不存在",
      });
    }

    // 检查是否有用户使用此角色
    const userCount = await User.count({
      where: { role_id: role.id },
    });

    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: `无法删除角色，还有 ${userCount} 个用户使用此角色`,
      });
    }

    const transaction = await db.sequelize.transaction();

    try {
      // 删除角色权限关联
      await RolePermission.destroy({
        where: { role_id: role.id },
        transaction,
      });

      // 删除角色
      await role.destroy({ transaction });

      await transaction.commit();

      res.json({
        success: true,
        message: "删除角色成功",
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  })
);

// ========== 用户角色管理 ==========

// 分配用户角色
router.post(
  "/users/:userId/role",
  authenticate,
  checkPermission("user.role.assign"),
  asyncHandler(async (req, res) => {
    const { role_id } = req.body;
    const { userId } = req.params;

    if (!role_id) {
      return res.status(400).json({
        success: false,
        message: "角色ID不能为空",
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "用户不存在",
      });
    }

    const role = await Role.findByPk(role_id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "角色不存在",
      });
    }

    user.role_id = role_id;
    await user.save();

    res.json({
      success: true,
      message: `成功为用户分配角色: ${role.display_name}`,
      data: {
        user_id: user.id,
        role: {
          id: role.id,
          name: role.name,
          display_name: role.display_name,
        },
      },
    });
  })
);

// 获取用户角色和权限
router.get(
  "/users/:userId/permissions",
  authenticate,
  checkPermission("user.view"),
  asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.params.userId, {
      include: [
        {
          model: Role,
          as: "role",
          include: [
            {
              model: Permission,
              as: "permissions",
              attributes: ["id", "name", "display_name", "module"],
            },
          ],
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "用户不存在",
      });
    }

    res.json({
      success: true,
      message: "获取用户权限成功",
      data: {
        user_id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.role ? user.role.permissions : [],
      },
    });
  })
);

// ========== 系统权限初始化 ==========

// 重新初始化权限和角色数据
router.post(
  "/initialize",
  authenticate,
  checkMultiplePermissions(["role.create", "permission.view"]),
  asyncHandler(async (req, res) => {
    try {
      await initializePermissionsAndRoles();

      res.json({
        success: true,
        message: "权限和角色系统初始化成功",
      });
    } catch (error) {
      console.error("权限初始化失败:", error);
      res.status(500).json({
        success: false,
        message: "权限和角色系统初始化失败",
        error: error.message,
      });
    }
  })
);

export default router;
