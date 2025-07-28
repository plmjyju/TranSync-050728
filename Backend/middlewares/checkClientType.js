// middlewares/checkClientType.js
export const checkClientType = (expectedType) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "未认证用户" });
    }

    if (req.user.client_type !== expectedType) {
      return res.status(403).json({
        message: `禁止访问：仅限 ${expectedType} 端用户访问此模块`,
      });
    }

    next();
  };
};
