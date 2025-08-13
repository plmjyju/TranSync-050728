import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";

const router = express.Router();
const { OperationRequirement, UserOperationRequirement } = db;

// GET /api/client/operation-requirements
// 列出当前客户端用户可见/可选的 OperationRequirements
router.get("/operation-requirements", authenticate, async (req, res) => {
  try {
    if (!req.user || req.user.userType !== "client") {
      return res
        .status(403)
        .json({ success: false, message: "仅限客户端用户" });
    }

    const userId = req.user.id;

    // 是否存在用户级白名单绑定
    const bindingCount = await UserOperationRequirement.count({
      where: { user_id: userId, is_enabled: true },
    });

    let requirements;
    if (bindingCount > 0) {
      // 使用白名单
      requirements = await OperationRequirement.findAll({
        include: [
          {
            model: UserOperationRequirement,
            as: "userBindings",
            where: { user_id: userId, is_enabled: true },
            required: true,
            attributes: ["is_selectable", "is_enabled"],
          },
        ],
        where: { is_active: true },
        order: [
          ["sort_order", "ASC"],
          ["id", "ASC"],
        ],
      });
    } else {
      // 全局可见策略
      requirements = await OperationRequirement.findAll({
        where: { is_active: true, is_client_visible: true },
        order: [
          ["sort_order", "ASC"],
          ["id", "ASC"],
        ],
      });
    }

    const data = requirements.map((r) => ({
      id: r.id,
      requirement_code: r.requirement_code,
      requirement_name: r.requirement_name,
      distribution_mode: r.distribution_mode,
      carrier_channel: r.carrier_channel,
      delivery_destination_type: r.delivery_destination_type,
      delivery_destination_code: r.delivery_destination_code,
      delivery_destination_name: r.delivery_destination_name,
      is_client_selectable:
        bindingCount > 0
          ? r.userBindings[0].is_selectable
          : r.is_client_selectable,
      is_client_visible: bindingCount > 0 ? true : r.is_client_visible,
      category: r.category,
      priority_level: r.priority_level,
      sort_order: r.sort_order,
    }));

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error("获取客户端 OperationRequirements 失败:", error);
    res.status(500).json({ success: false, message: "获取失败" });
  }
});

export default router;
