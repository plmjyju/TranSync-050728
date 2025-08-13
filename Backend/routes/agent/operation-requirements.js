import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";

const router = express.Router();
const { OperationRequirement, CustomerOperationRequirement, Customer } = db;

// Agent 获取自己客户的可用 OperationRequirements (按 customerId)
router.get(
  "/operation-requirements/:customerId",
  authenticate,
  checkPermission("agent.package.view"),
  async (req, res) => {
    try {
      const { customerId } = req.params;
      // TODO: 加入验证该 customerId 属于当前 agent (需要 AgentCustomer 关系)

      // 先查客户级绑定
      const bindingCount = await CustomerOperationRequirement.count({
        where: { customer_id: customerId, is_enabled: true },
      });

      let list;
      if (bindingCount > 0) {
        list = await OperationRequirement.findAll({
          include: [
            {
              model: CustomerOperationRequirement,
              as: "customerBindings",
              where: { customer_id: customerId, is_enabled: true },
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
        list = await OperationRequirement.findAll({
          where: { is_active: true, is_client_visible: true },
          order: [
            ["sort_order", "ASC"],
            ["id", "ASC"],
          ],
        });
      }

      res.json({
        success: true,
        customerId,
        count: list.length,
        data: list.map((r) => ({
          id: r.id,
          requirement_code: r.requirement_code,
          requirement_name: r.requirement_name,
          distribution_mode: r.distribution_mode,
          carrier_channel: r.carrier_channel,
          delivery_destination_type: r.delivery_destination_type,
          delivery_destination_code: r.delivery_destination_code,
          delivery_destination_name: r.delivery_destination_name,
          is_selectable:
            bindingCount > 0
              ? r.customerBindings[0].is_selectable
              : r.is_client_selectable,
          category: r.category,
          sort_order: r.sort_order,
        })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, message: "获取失败" });
    }
  }
);

// Agent 绑定客户可见列表（覆盖模式）
router.post(
  "/operation-requirements/:customerId/bind",
  authenticate,
  checkPermission("agent.package.edit"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const { customerId } = req.params;
      const { requirement_codes = [], selectable_codes = [] } = req.body;

      const allReqs = await OperationRequirement.findAll({
        where: { requirement_code: requirement_codes },
      });
      if (allReqs.length !== requirement_codes.length) {
        await t.rollback();
        return res
          .status(400)
          .json({ success: false, message: "存在无效 requirement_code" });
      }

      // 删除旧绑定
      await CustomerOperationRequirement.destroy({
        where: { customer_id: customerId },
        transaction: t,
      });

      // 创建新绑定
      for (const r of allReqs) {
        await CustomerOperationRequirement.create(
          {
            customer_id: customerId,
            operation_requirement_id: r.id,
            is_selectable: selectable_codes.includes(r.requirement_code),
            is_enabled: true,
          },
          { transaction: t }
        );
      }

      await t.commit();
      res.json({
        success: true,
        message: "绑定更新完成",
        count: allReqs.length,
      });
    } catch (e) {
      await t.rollback();
      console.error(e);
      res.status(500).json({ success: false, message: "绑定失败" });
    }
  }
);

export default router;
