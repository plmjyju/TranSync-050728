// middlewares/authenticate.js
import jwt from "jsonwebtoken";
import db from "../models/index.js";
import config from "../config/environment.js";

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "请提供访问令牌",
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);

    // 临时调试信息
    console.log("🔍 Token解析成功:", {
      id: decoded.id,
      userType: decoded.userType,
      role: decoded.roleName || decoded.role,
      permissionCount: decoded.permissions?.length || 0,
    });

    let user;

    if (decoded.userType === "client") {
      // 客户端用户从Customer表查找
      user = await db.Customer.findOne({
        where: { id: decoded.id, isActive: true },
      });

      console.log("🔍 数据库查询结果:", user ? "找到客户" : "未找到客户");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "用户不存在或已被停用",
        });
      }

      req.user = {
        id: user.id,
        userType: "client",
        customerName: user.customerName,
        email: user.email,
        companyName: user.companyName,
        salesRepId: user.salesRepId,
        role: decoded.role || "client_standard",
        permissions: decoded.permissions || [],
      };
    } else {
      // 系统用户从token中获取完整信息，无需查询数据库
      console.log("🔍 系统用户token信息验证");

      req.user = {
        id: decoded.id,
        username: decoded.username,
        userType: decoded.userType || "system",
        email: decoded.email,
        roleId: decoded.roleId,
        roleName: decoded.roleName,
        roleDisplayName: decoded.roleDisplayName,
        permissions: decoded.permissions || [],
      };
    }

    console.log(
      "✅ 认证成功:",
      req.user.userType,
      req.user.id,
      `权限数量:${req.user.permissions?.length || 0}`
    );
    next();
  } catch (error) {
    console.log("❌ 认证失败:", error.name, error.message);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "访问令牌已过期，请重新登录",
      });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "访问令牌无效",
      });
    }
    return res.status(401).json({
      success: false,
      message: "身份验证失败",
    });
  }
};

export default authenticate;
export { authenticate };
