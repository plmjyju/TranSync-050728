import db from "../models/index.js";
const { Role, Permission } = db;

export const checkPermission = (permissionName) => {
  return async (req, res, next) => {
    const user = req.user;
    const role = await Role.findByPk(user.role_id, {
      include: [{ model: Permission, as: "permissions" }],
    });

    const hasPermission = role.permissions.some(
      (p) => p.name === permissionName
    );
    if (!hasPermission) {
      return res
        .status(403)
        .json({ message: `Permission '${permissionName}' denied` });
    }
    next();
  };
};
