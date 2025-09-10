import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";
import { applyScopeToWhere } from "../../utils/scope.js";
import { buildError, ERROR_CODES } from "../../utils/errors.js";

const router = express.Router();
const { OperationRequirement, Customer } = db;

// Agent 获取自己客户的可用 OperationRequirements (按 customerId)
router.get(
  "/operation-requirements/:customerId",
  authenticate,
  checkPermission("agent.package.view"),
  async (req, res) => {
    try {
      const rawId = req.params.customerId;
      const customerId = Number(rawId);
      if (!Number.isInteger(customerId) || customerId <= 0) {
        return res
          .status(400)
          .json(buildError(ERROR_CODES.VALIDATION_FAILED, "非法客户ID"));
      }
      // 校验客户归属（仅允许访问自己名下客户）
      const cust = await Customer.findOne({
        where: applyScopeToWhere(
          { id: customerId, salesRepId: req.user.id },
          Customer,
          req.user
        ),
        attributes: ["id"],
      });
      if (!cust) {
        return res
          .status(404)
          .json(
            buildError(ERROR_CODES.CUSTOMER_NOT_FOUND, "客户不存在或无权限")
          );
      }

      // 简化：返回所有启用项（加作用域，若模型具备相关列）
      const list = await OperationRequirement.findAll({
        where: applyScopeToWhere(
          { is_active: true },
          OperationRequirement,
          req.user
        ),
        order: [
          ["sort_order", "ASC"],
          ["requirement_code", "ASC"],
        ],
      });

      res.json({
        success: true,
        customerId,
        count: list.length,
        data: list.map((r) => ({
          id: r.id,
          requirement_code: r.requirement_code,
          requirement_name: r.requirement_name,
          description: r.description,
          handling_mode: r.handling_mode,
          carrier: r.carrier,
          label_abbr: r.label_abbr,
          sort_order: r.sort_order,
        })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json(buildError(ERROR_CODES.UNKNOWN_ERROR, "获取失败"));
    }
  }
);

// 绑定客户可见列表（此简化版暂保留接口签名，但不实现复杂白名单，未来可扩展）
router.post(
  "/operation-requirements/:customerId/bind",
  authenticate,
  checkPermission("agent.package.edit"),
  async (req, res) => {
    return res
      .status(501)
      .json(
        buildError(
          "OPREQ_BIND_NOT_IMPLEMENTED",
          "暂不支持客户白名单绑定（简化模式）"
        )
      );
  }
);

export default router;
