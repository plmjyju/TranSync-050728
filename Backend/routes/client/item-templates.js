import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import { checkPermission } from "../../middlewares/checkPermission.js";
import { writeAudit } from "../../utils/auditHelper.js";
import { Op } from "sequelize";

const router = express.Router();

// 列表当前客户的物品模板
router.get(
  "/item-templates",
  authenticate,
  checkPermission("client.package.item.view"),
  async (req, res) => {
    const clientId = req.user.id;
    const list = await db.ItemTemplate.findAll({
      where: { client_id: clientId },
      order: [["updated_at", "DESC"]],
      limit: 100,
    });
    res.json({ success: true, items: list });
  }
);

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function normalizePayload(raw) {
  const src = raw?.template || raw || {};
  const productName = (src.product_name || src.name || "").trim();
  const description = (
    src.product_description ||
    src.description_of_good ||
    ""
  ).trim();
  const hsCode = src.hs_code ?? src.hsCode ?? null;
  const materials = src.materials ?? src.material ?? null;
  const country =
    src.country_of_origin ?? src.origin_country ?? src.origin ?? null;
  const unitPrice = src.unit_price_usd ?? src.price ?? null;
  const unitSystem =
    (src.unit_system || src.unit || null) === "imperial"
      ? "imperial"
      : src.unit_system === "metric" || src.unit === "metric"
      ? "metric"
      : null;

  const len = toNum(src.length);
  const wid = toNum(src.width);
  const hei = toNum(src.height);
  const wei = toNum(src.weight);
  const isImperial = unitSystem === "imperial";
  const length_cm = len == null ? null : isImperial ? len * 2.54 : len;
  const width_cm = wid == null ? null : isImperial ? wid * 2.54 : wid;
  const height_cm = hei == null ? null : isImperial ? hei * 2.54 : hei;
  const weight_kg = wei == null ? null : isImperial ? wei * 0.45359237 : wei;

  return {
    product_name: productName || null,
    description_of_good: description || null,
    hs_code: hsCode || null,
    materials: materials || null,
    country_of_origin: country || null,
    unit_price_usd: unitPrice == null ? null : unitPrice,
    length_cm,
    width_cm,
    height_cm,
    weight_kg,
    unit_system: unitSystem,
    sku: src.sku ?? null,
    qty: src.qty ?? null,
    manufacturer: src.manufacturer ?? null,
    total_boxes: src.total_boxes ?? null,
    total_value_usd: src.total_value_usd ?? null,
  };
}

// 保存/更新模板
router.post(
  "/item-templates",
  authenticate,
  checkPermission("client.package.item.add"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const clientId = req.user.id;
      const { id } = req.body || {};
      const payload = normalizePayload(req.body);

      // 物品名称必填
      if (!payload.product_name) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          code: "ITEM_NAME_REQUIRED",
          message: "物品名称不能为空",
        });
      }

      // 唯一性（同客户）
      const exists = await db.ItemTemplate.findOne({
        where: { client_id: clientId, product_name: payload.product_name },
        transaction: t,
      });

      let model;
      if (id) {
        model = await db.ItemTemplate.findOne({
          where: { id, client_id: clientId },
          transaction: t,
        });
        if (!model) {
          await t.rollback();
          return res.status(404).json({
            success: false,
            code: "ITEM_TEMPLATE_NOT_FOUND",
            message: "模板不存在",
          });
        }
        if (exists && exists.id !== model.id) {
          await t.rollback();
          return res.status(409).json({
            success: false,
            code: "ITEM_TEMPLATE_DUPLICATE",
            message: "名称重复",
          });
        }
        await model.update({ ...payload }, { transaction: t });
      } else {
        if (exists) {
          await t.rollback();
          return res.status(409).json({
            success: false,
            code: "ITEM_TEMPLATE_DUPLICATE",
            message: "名称重复",
          });
        }
        model = await db.ItemTemplate.create(
          { client_id: clientId, ...payload },
          { transaction: t }
        );
      }

      await t.commit();
      writeAudit({
        module: "client",
        entityType: "ItemTemplate",
        entityId: model.id,
        action: id ? "update" : "create",
        user: req.user,
        before: null,
        after: model.toJSON(),
        ip: req.ip,
        ua: req.headers["user-agent"],
      });

      res.json({
        success: true,
        message: id ? "更新成功" : "创建成功",
        item: model,
      });
    } catch (e) {
      await t.rollback();
      if (e?.name === "SequelizeUniqueConstraintError") {
        return res.status(409).json({
          success: false,
          code: "ITEM_TEMPLATE_DUPLICATE",
          message: "名称重复",
        });
      }
      res.status(500).json({
        success: false,
        code: "ITEM_TEMPLATE_SAVE_ERROR",
        message: "保存失败",
      });
    }
  }
);

// 物品联想下拉（根据输入筛选），用于表格中点击“物品名称”弹出的下拉
router.get(
  "/package-items/suggestions",
  authenticate,
  checkPermission("client.package.item.view"),
  async (req, res) => {
    const clientId = req.user.id;
    const { kw, lim = 10 } = req.query || {};

    const fromItems = await db.Item.findAll({
      attributes: [
        "product_name_en",
        "product_description",
        "material",
        "origin_country",
        "hs_code",
        "length_cm",
        "width_cm",
        "height_cm",
      ],
      where: {
        client_id: clientId,
        ...(kw
          ? {
              [Op.or]: [
                { product_name_en: { [Op.like]: `%${kw}%` } },
                { product_description: { [Op.like]: `%${kw}%` } },
                { material: { [Op.like]: `%${kw}%` } },
                { hs_code: { [Op.like]: `%${kw}%` } },
              ],
            }
          : {}),
      },
      order: [["updated_at", "DESC"]],
      limit: lim,
    });

    // 2) 来自 ItemTemplate（限定当前客户）
    const fromTpls = await db.ItemTemplate.findAll({
      attributes: [
        [db.sequelize.col("product_name"), "product_name"],
        [db.sequelize.col("description_of_good"), "product_description"],
        [db.sequelize.col("materials"), "material"],
        [db.sequelize.col("country_of_origin"), "origin_country"],
        [db.sequelize.col("hs_code"), "hs_code"],
      ],
      where: {
        client_id: clientId,
        ...(kw
          ? {
              [Op.or]: [
                { product_name: { [Op.like]: `%${kw}%` } },
                { description_of_good: { [Op.like]: `%${kw}%` } },
                { materials: { [Op.like]: `%${kw}%` } },
                { hs_code: { [Op.like]: `%${kw}%` } },
              ],
            }
          : {}),
      },
      order: [["updated_at", "DESC"]],
      limit: lim,
    });

    // 合并与去重（按 name+desc+material+origin+hs）
    const uniq = new Map();
    const pushUniq = (r) => {
      const key = [
        r.product_name || r.product_name_en || "",
        r.product_description || "",
        r.material || "",
        r.origin_country || "",
        r.hs_code || "",
      ].join("|");
      if (!uniq.has(key)) uniq.set(key, r);
    };
    fromItems.forEach((it) =>
      pushUniq({
        product_name_en: it.product_name_en || null,
        product_description: it.product_description || null,
        material: it.material || null,
        origin_country: it.origin_country || null,
        hs_code: it.hs_code || null,
        length_cm: it.length_cm || null,
        width_cm: it.width_cm || null,
        height_cm: it.height_cm || null,
      })
    );
    fromTpls.forEach((t) =>
      pushUniq({
        product_name: t.get("product_name") || null,
        product_description: t.get("product_description") || null,
        material: t.get("material") || null,
        origin_country: t.get("origin_country") || null,
        hs_code: t.get("hs_code") || null,
        length_cm: null,
        width_cm: null,
        height_cm: null,
      })
    );

    const list = Array.from(uniq.values()).slice(0, lim);
    res.json({ success: true, suggestions: list });
  }
);

// “新物品”弹窗：创建 ItemTemplate 以便下次快速选择（旧版，已兼容，避免与新版冲突）
router.post(
  "/item-templates-legacy",
  authenticate,
  checkPermission("client.package.item.add"),
  async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
      const clientId = req.user.id;
      const { id } = req.body || {};
      const payload = normalizePayload(req.body);

      // 物品名称必填
      if (!payload.product_name) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          code: "ITEM_NAME_REQUIRED",
          message: "物品名称不能为空",
        });
      }

      // 唯一性（同客户）
      const exists = await db.ItemTemplate.findOne({
        where: { client_id: clientId, product_name: payload.product_name },
        transaction: t,
      });

      let model;
      if (id) {
        model = await db.ItemTemplate.findOne({
          where: { id, client_id: clientId },
          transaction: t,
        });
        if (!model) {
          await t.rollback();
          return res.status(404).json({
            success: false,
            code: "ITEM_TEMPLATE_NOT_FOUND",
            message: "模板不存在",
          });
        }
        if (exists && exists.id !== model.id) {
          await t.rollback();
          return res.status(409).json({
            success: false,
            code: "ITEM_TEMPLATE_DUPLICATE",
            message: "名称重复",
          });
        }
        await model.update({ ...payload }, { transaction: t });
      } else {
        if (exists) {
          await t.rollback();
          return res.status(409).json({
            success: false,
            code: "ITEM_TEMPLATE_DUPLICATE",
            message: "名称重复",
          });
        }
        model = await db.ItemTemplate.create(
          { client_id: clientId, ...payload },
          { transaction: t }
        );
      }

      await t.commit();
      writeAudit({
        module: "client",
        entityType: "ItemTemplate",
        entityId: model.id,
        action: id ? "update" : "create",
        user: req.user,
        before: null,
        after: model.toJSON(),
        ip: req.ip,
        ua: req.headers["user-agent"],
      });

      res.json({
        success: true,
        message: id ? "更新成功" : "创建成功",
        item: model,
      });
    } catch (e) {
      await t.rollback();
      if (e?.name === "SequelizeUniqueConstraintError") {
        return res.status(409).json({
          success: false,
          code: "ITEM_TEMPLATE_DUPLICATE",
          message: "名称重复",
        });
      }
      res.status(500).json({
        success: false,
        code: "ITEM_TEMPLATE_SAVE_ERROR",
        message: "保存失败",
      });
    }
  }
);

export default router;
