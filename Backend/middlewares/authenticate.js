// middlewares/authenticate.js
import jwt from "jsonwebtoken";
import db from "../models/index.js";

export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await db.User.findByPk(decoded.id);
    if (!user || user.status !== "active") throw new Error();

    req.user = {
      id: user.id,
      role_id: user.role_id,
      username: user.username,
      client_type: decoded.aud || user.client_type, // 用 aud 字段更安全
    };

    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
