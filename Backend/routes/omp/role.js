import express from "express";
import db from "../../models/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { recordSystemActivity } from "../../utils/recordSystemActivity.js";

const router = express.Router();

router.post("/create-role", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { name, display_name, description, permissionIds } = req.body;
    if (
      !name ||
      !display_name ||
      !permissionIds ||
      !Array.isArray(permissionIds)
    ) {
      return res.status(400).json({
        error: "Missing required fields or invalid permissions format",
      });
    }

    const existingRole = await db.Role.findOne({
      where: { name },
      transaction: t,
    });
    if (existingRole) {
      await t.rollback();
      return res.status(400).json({ error: "Role name already exists" });
    }

    const role = await db.Role.create(
      { name, display_name, description },
      { transaction: t }
    );

    const permissionRecords = await db.Permission.findAll({
      where: { id: permissionIds },
      transaction: t,
    });

    if (permissionRecords.length !== permissionIds.length) {
      await t.rollback();
      return res.status(400).json({ error: "Some permissions do not exist" });
    }

    await role.setPermissions(permissionRecords, { transaction: t });

    await recordSystemActivity(
      {
        userId: req.user.id,
        clientType: req.user.client_type,
        event: "create-role",
        remark: `管理员 ${req.user.username} 创建角色 ${name} 并绑定权限`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    await t.commit();
    return res.status(201).json({
      message: "Role created successfully and permissions bound",
      role,
    });
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ error: "Failed to create role" });
  }
});

router.get("/permissions", authenticate, async (req, res) => {
  try {
    const permissions = await db.Permission.findAll();
    return res.status(200).json({ permissions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch permissions" });
  }
});

router.post("/modify-role-permissions", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { roleId, permissionIds } = req.body;
    if (!roleId || !permissionIds || !Array.isArray(permissionIds)) {
      return res.status(400).json({
        error: "Missing required fields or invalid permissions format",
      });
    }

    const role = await db.Role.findByPk(roleId, { transaction: t });
    if (!role) {
      await t.rollback();
      return res.status(404).json({ error: "Role not found" });
    }

    const permissionRecords = await db.Permission.findAll({
      where: { id: permissionIds },
      transaction: t,
    });

    if (permissionRecords.length !== permissionIds.length) {
      await t.rollback();
      return res.status(400).json({ error: "Some permissions do not exist" });
    }

    await role.setPermissions(permissionRecords, { transaction: t });

    await recordSystemActivity(
      {
        userId: req.user.id,
        clientType: req.user.client_type,
        event: "modify-role-permissions",
        remark: `管理员 ${req.user.username} 修改角色 ${role.name} 的权限`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    await t.commit();
    return res
      .status(200)
      .json({ message: "Role permissions modified successfully" });
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ error: "Failed to modify role permissions" });
  }
});

router.get("/roles", authenticate, async (req, res) => {
  try {
    const roles = await db.Role.findAll({
      include: [{ model: db.Permission, as: "permissions" }],
    });
    return res.status(200).json({ roles });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch roles" });
  }
});

router.post("/toggle-role-status", authenticate, async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { roleId, status } = req.body;
    if (typeof status !== "boolean" || !roleId) {
      return res.status(400).json({
        error: "Missing required fields or invalid status format",
      });
    }

    const role = await db.Role.findByPk(roleId, {
      include: [{ model: db.User, as: "users" }],
      transaction: t,
    });

    if (!role) {
      await t.rollback();
      return res.status(404).json({ error: "Role not found" });
    }

    role.status = status;
    await role.save({ transaction: t });

    if (!status && role.users.length > 0) {
      await Promise.all(
        role.users.map(async (user) => {
          user.role_id = null;
          await user.save({ transaction: t });
        })
      );
    }

    await recordSystemActivity(
      {
        userId: req.user.id,
        clientType: req.user.client_type,
        event: "toggle-role-status",
        remark: `管理员 ${req.user.username} ${status ? "启用" : "停用"}角色 ${
          role.name
        }`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
      db
    );

    await t.commit();
    return res.status(200).json({
      message: `Role ${status ? "enabled" : "disabled"} successfully`,
    });
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ error: "Failed to toggle role status" });
  }
});

export default router;
