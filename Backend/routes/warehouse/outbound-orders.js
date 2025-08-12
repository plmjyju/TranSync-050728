import express from "express";
import db from "../../models/index.js";
import authenticate from "../../middlewares/authenticate.js";
import checkPermission from "../../middlewares/checkPermission.js";

const router = express.Router();
const {
  OutboundOrder,
  OutboundOrderLog,
  Package,
  PalletAllocation,
  User,
  Forecast,
} = db;

// 生成出库单号
const generateOutboundNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const time =
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");

  return `OUT${year}${month}${day}${time}${random}`;
};

// 基于板子创建出库单
router.post(
  "/outbound-orders",
  authenticate,
  checkPermission("warehouse.outbound.create"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        pallet_numbers, // 改为以板子为主
        pickup_contact_person,
        pickup_contact_phone,
        pickup_vehicle_info,
        notes,
      } = req.body;

      // 验证必填字段
      if (
        !pallet_numbers ||
        !Array.isArray(pallet_numbers) ||
        pallet_numbers.length === 0
      ) {
        await transaction.rollback();
        return res.status(400).json({
          error: "板号列表不能为空",
        });
      }

      // 查找指定的PalletAllocation
      const palletAllocations = await PalletAllocation.findAll({
        where: {
          pallet_number: {
            [db.Sequelize.Op.in]: pallet_numbers,
          },
          status: "stored", // 只有已入库的板子才能出库
        },
        include: [
          {
            model: Package,
            as: "packages",
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "client_id", "awb", "mawb"],
                include: [
                  {
                    model: User,
                    as: "client",
                    attributes: ["id", "username", "name", "role"],
                  },
                ],
              },
            ],
          },
        ],
        transaction,
      });

      if (palletAllocations.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          error: "未找到指定的已入库板子",
        });
      }

      if (palletAllocations.length !== pallet_numbers.length) {
        const foundPallets = palletAllocations.map(p => p.pallet_number);
        const missingPallets = pallet_numbers.filter(p => !foundPallets.includes(p));
        await transaction.rollback();
        return res.status(404).json({
          error: `以下板子未找到或未入库: ${missingPallets.join(', ')}`,
        });
      }

      // 获取所有相关包裹
      const allPackages = palletAllocations.reduce((acc, pallet) => {
        return acc.concat(pallet.packages || []);
      }, []);

      // 检查所有包裹是否属于同一个客户
      const clientIds = [
        ...new Set(
          allPackages
            .filter(pkg => pkg.forecast)
            .map((pkg) => pkg.forecast.client_id)
        ),
      ];
      
      if (clientIds.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          error: "板子中没有找到有效的包裹信息",
        });
      }

      if (clientIds.length > 1) {
        await transaction.rollback();
        return res.status(400).json({
          error: "所有板子中的包裹必须属于同一个客户",
        });
      }

      const clientId = clientIds[0];

      // 获取所有相关的AWB号
      const awbNumbers = [
        ...new Set(
          allPackages
            .filter(pkg => pkg.forecast)
            .map((pkg) => pkg.forecast.awb)
        ),
      ];

      // 计算总包裹数量和总重量
      const totalPackages = allPackages.length;
      const totalWeight = allPackages.reduce((sum, pkg) => {
        return sum + (parseFloat(pkg.weight_kg) || 0);
      }, 0);

      // 生成出库单号
      const outboundNumber = generateOutboundNumber();

      // 创建出库单
      const outboundOrder = await OutboundOrder.create(
        {
          outbound_number: outboundNumber,
          client_id: clientId,
          awb_numbers: awbNumbers,
          pallet_numbers: pallet_numbers,
          total_packages: totalPackages,
          total_weight: totalWeight,
          pickup_contact_person,
          pickup_contact_phone,
          pickup_vehicle_info,
          notes,
          created_by: req.user.id,
        },
        { transaction }
      );

      // 记录操作日志
      await OutboundOrderLog.create(
        {
          outbound_order_id: outboundOrder.id,
          action: "created",
          operator_id: req.user.id,
          details: {
            pallet_numbers: pallet_numbers,
            awb_numbers: awbNumbers,
            total_packages: totalPackages,
            total_weight: totalWeight,
            pallet_details: palletAllocations.map(pallet => ({
              pallet_number: pallet.pallet_number,
              awb_number: pallet.awb_number,
              package_count: pallet.packages?.length || 0,
            })),
          },
          notes: `创建出库单，包含${pallet_numbers.length}个板子，${awbNumbers.length}个AWB，${totalPackages}个包裹`,
        },
        { transaction }
      );

      await transaction.commit();

      // 获取完整的出库单信息（包含关联数据）
      const fullOutboundOrder = await OutboundOrder.findByPk(outboundOrder.id, {
        include: [
          {
            model: User,
            as: "client",
            attributes: ["id", "username", "name"],
          },
          {
            model: User,
            as: "creator",
            attributes: ["id", "username", "name"],
          },
        ],
      });

      res.status(201).json({
        message: "出库单创建成功",
        outbound_order: fullOutboundOrder,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("创建出库单失败:", error);
      res.status(500).json({ error: "创建出库单失败" });
    }
  }
);

// 获取可出库的板子列表
router.get(
  "/available-pallets",
  authenticate,
  checkPermission("warehouse.outbound.view"),
  async (req, res) => {
    try {
      const { 
        client_id, 
        awb_number,
        pallet_number 
      } = req.query;

      const whereClause = {
        status: "stored", // 只显示已入库的板子
      };

      const packageInclude = {
        model: Package,
        as: "packages",
        include: [
          {
            model: Forecast,
            as: "forecast",
            attributes: ["id", "client_id", "awb", "mawb"],
            include: [
              {
                model: User,
                as: "client",
                attributes: ["id", "username", "name"],
              },
            ],
          },
        ],
      };

      // 根据用户角色和查询条件过滤
      if (req.user.role === "client") {
        // 客户只能看到自己的板子
        packageInclude.include[0].where = { client_id: req.user.id };
      } else if (client_id) {
        packageInclude.include[0].where = { client_id };
      }

      if (awb_number) {
        if (!packageInclude.include[0].where) {
          packageInclude.include[0].where = {};
        }
        packageInclude.include[0].where.awb = {
          [db.Sequelize.Op.like]: `%${awb_number}%`,
        };
      }

      if (pallet_number) {
        whereClause.pallet_number = {
          [db.Sequelize.Op.like]: `%${pallet_number}%`,
        };
      }

      const palletAllocations = await PalletAllocation.findAll({
        where: whereClause,
        include: [packageInclude],
        order: [["created_at", "DESC"]],
      });

      // 过滤掉没有包裹的板子，并按客户分组
      const validPallets = palletAllocations.filter(pallet => 
        pallet.packages && pallet.packages.length > 0
      );

      // 按客户分组
      const palletsByClient = {};
      validPallets.forEach(pallet => {
        const packages = pallet.packages.filter(pkg => pkg.forecast);
        if (packages.length === 0) return;

        const clientId = packages[0].forecast.client_id;
        const clientName = packages[0].forecast.client.name;
        
        if (!palletsByClient[clientId]) {
          palletsByClient[clientId] = {
            client_id: clientId,
            client_name: clientName,
            pallets: [],
          };
        }

        // 获取这个板子涉及的所有AWB
        const awbNumbers = [...new Set(packages.map(pkg => pkg.forecast.awb))];
        
        palletsByClient[clientId].pallets.push({
          id: pallet.id,
          pallet_number: pallet.pallet_number,
          awb_number: pallet.awb_number,
          total_package_count: pallet.total_package_count,
          allocated_package_count: pallet.allocated_package_count,
          awb_numbers: awbNumbers,
          package_count: packages.length,
          total_weight: packages.reduce((sum, pkg) => sum + (parseFloat(pkg.weight_kg) || 0), 0),
          status: pallet.status,
          created_at: pallet.created_at,
        });
      });

      res.json({
        pallets_by_client: Object.values(palletsByClient),
        total_clients: Object.keys(palletsByClient).length,
        total_pallets: validPallets.length,
      });
    } catch (error) {
      console.error("获取可出库板子列表失败:", error);
      res.status(500).json({ error: "获取可出库板子列表失败" });
    }
  }
);

// 基于板子创建出库单
router.post(
  "/create",
  authenticate,
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const {
        pallet_numbers,
        pickup_contact_person,
        pickup_contact_phone,
        pickup_vehicle_info,
        notes,
      } = req.body;

      // 验证输入
      if (!pallet_numbers || !Array.isArray(pallet_numbers) || pallet_numbers.length === 0) {
        return res.status(400).json({ error: "必须提供至少一个板号" });
      }

      // 获取板子信息并验证
      const palletAllocations = await PalletAllocation.findAll({
        where: {
          pallet_number: pallet_numbers,
          status: "stored", // 只能选择已入库的板子
        },
        include: [
          {
            model: Package,
            as: "packages",
            include: [
              {
                model: Forecast,
                as: "forecast",
                attributes: ["id", "client_id", "awb", "mawb"],
                include: [
                  {
                    model: User,
                    as: "client",
                    attributes: ["id", "username", "name"],
                  },
                ],
              },
            ],
          },
        ],
      });

      if (palletAllocations.length !== pallet_numbers.length) {
        return res.status(400).json({ 
          error: "部分板号不存在或不可用于出库" 
        });
      }

      // 验证所有板子属于同一个客户
      const clientIds = new Set();
      const awbNumbers = new Set();
      let totalPackages = 0;
      let totalWeight = 0;

      palletAllocations.forEach(pallet => {
        pallet.packages.forEach(pkg => {
          if (pkg.forecast) {
            clientIds.add(pkg.forecast.client_id);
            awbNumbers.add(pkg.forecast.awb);
            totalPackages++;
            totalWeight += parseFloat(pkg.weight_kg) || 0;
          }
        });
      });

      if (clientIds.size !== 1) {
        return res.status(400).json({
          error: "所选板子必须属于同一个客户",
        });
      }

      const clientId = Array.from(clientIds)[0];

      // 生成出库单号
      const today = new Date();
      const dateStr = today.toISOString().slice(2, 10).replace(/-/g, "");
      const existingCount = await OutboundOrder.count({
        where: {
          outbound_number: {
            [db.Sequelize.Op.like]: `OUT${dateStr}%`,
          },
        },
      });
      const outboundNumber = `OUT${dateStr}-${String(existingCount + 1).padStart(3, "0")}`;

      const outboundOrder = await OutboundOrder.create(
        {
          outbound_number: outboundNumber,
          client_id: clientId,
          awb_numbers: awbNumbers,
          pallet_numbers: pallet_numbers,
          total_packages: totalPackages,
          total_weight: totalWeight,
          pickup_contact_person,
          pickup_contact_phone,
          pickup_vehicle_info,
          notes,
          created_by: req.user.id,
        },
        { transaction }
      );

      // 记录操作日志
      await OutboundOrderLog.create(
        {
          outbound_order_id: outboundOrder.id,
          action: "created",
          operator_id: req.user.id,
          details: {
            pallet_numbers: pallet_numbers,
            awb_numbers: awbNumbers,
            total_packages: totalPackages,
            total_weight: totalWeight,
            pallet_details: palletAllocations.map(pallet => ({
              pallet_number: pallet.pallet_number,
              awb_number: pallet.awb_number,
              package_count: pallet.packages?.length || 0,
            })),
          },
          notes: `创建出库单，包含${pallet_numbers.length}个板子，${awbNumbers.length}个AWB，${totalPackages}个包裹`,
        },
        { transaction }
      );

      await transaction.commit();

      // 获取完整的出库单信息（包含关联数据）
      const fullOutboundOrder = await OutboundOrder.findByPk(outboundOrder.id, {
        include: [
          {
            model: User,
            as: "client",
            attributes: ["id", "username", "name"],
          },
          {
            model: User,
            as: "creator",
            attributes: ["id", "username", "name"],
          },
        ],
      });

      res.status(201).json({
        message: "出库单创建成功",
        outbound_order: fullOutboundOrder,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("创建出库单失败:", error);
      res.status(500).json({ error: "创建出库单失败" });
    }
  }
);

// 获取出库单列表
router.get(
  "/outbound-orders",
  authenticate,
  checkPermission("warehouse.outbound.view"),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        client_id,
        outbound_number,
        awb_number,
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};

      // 根据用户角色过滤数据
      if (req.user.role === "client") {
        whereClause.client_id = req.user.id;
      } else if (client_id) {
        whereClause.client_id = client_id;
      }

      if (status) {
        whereClause.status = status;
      }

      if (outbound_number) {
        whereClause.outbound_number = {
          [db.Sequelize.Op.like]: `%${outbound_number}%`,
        };
      }

      if (awb_number) {
        whereClause.awb_numbers = {
          [db.Sequelize.Op.like]: `%${awb_number}%`,
        };
      }

      const { count, rows: outboundOrders } =
        await OutboundOrder.findAndCountAll({
          where: whereClause,
          include: [
            {
              model: User,
              as: "client",
              attributes: ["id", "username", "name"],
            },
            {
              model: User,
              as: "creator",
              attributes: ["id", "username", "name"],
            },
            {
              model: User,
              as: "confirmer",
              attributes: ["id", "username", "name"],
            },
          ],
          order: [["created_at", "DESC"]],
          limit: parseInt(limit),
          offset,
        });

      res.json({
        outbound_orders: outboundOrders,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      console.error("获取出库单列表失败:", error);
      res.status(500).json({ error: "获取出库单列表失败" });
    }
  }
);

// 获取出库单详情
router.get(
  "/outbound-orders/:id",
  authenticate,
  checkPermission("warehouse.outbound.view"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const whereClause = { id };

      // 客户只能查看自己的出库单
      if (req.user.role === "client") {
        whereClause.client_id = req.user.id;
      }

      const outboundOrder = await OutboundOrder.findOne({
        where: whereClause,
        include: [
          {
            model: User,
            as: "client",
            attributes: ["id", "username", "name"],
          },
          {
            model: User,
            as: "creator",
            attributes: ["id", "username", "name"],
          },
          {
            model: User,
            as: "confirmer",
            attributes: ["id", "username", "name"],
          },
          {
            model: OutboundOrderLog,
            as: "logs",
            include: [
              {
                model: User,
                as: "operator",
                attributes: ["id", "username", "name"],
              },
            ],
            order: [["created_at", "DESC"]],
          },
        ],
      });

      if (!outboundOrder) {
        return res.status(404).json({ error: "出库单不存在" });
      }

      res.json({
        outbound_order: outboundOrder,
      });
    } catch (error) {
      console.error("获取出库单详情失败:", error);
      res.status(500).json({ error: "获取出库单详情失败" });
    }
  }
);

// 仓库确认出库（上传签名文档）
router.patch(
  "/outbound-orders/:id/confirm",
  authenticate,
  checkPermission("warehouse.outbound.confirm"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { signed_document_url, notes } = req.body;

      // 验证必填字段
      if (!signed_document_url) {
        await transaction.rollback();
        return res.status(400).json({
          error: "签名文档URL为必填字段",
        });
      }

      const outboundOrder = await OutboundOrder.findByPk(id, { transaction });

      if (!outboundOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "出库单不存在" });
      }

      if (outboundOrder.status !== "pending") {
        await transaction.rollback();
        return res.status(400).json({
          error: "只有待确认状态的出库单才能确认出库",
        });
      }

      // 更新出库单状态
      await outboundOrder.update(
        {
          status: "confirmed",
          signed_document_url,
          confirmed_by: req.user.id,
          confirmed_at: new Date(),
          notes: notes || outboundOrder.notes,
        },
        { transaction }
      );

      // 更新相关PalletAllocation状态为已出库
      await PalletAllocation.update(
        { status: "shipped" },
        {
          where: {
            pallet_number: {
              [db.Sequelize.Op.in]: outboundOrder.pallet_numbers,
            },
          },
          transaction,
        }
      );

      // 更新相关Package状态为已出库
      const packages = await Package.findAll({
        include: [
          {
            model: Forecast,
            as: "forecast",
            where: {
              awb: {
                [db.Sequelize.Op.in]: outboundOrder.awb_numbers,
              },
            },
          },
        ],
        transaction,
      });

      await Package.update(
        { status: "shipped" },
        {
          where: {
            id: {
              [db.Sequelize.Op.in]: packages.map((pkg) => pkg.id),
            },
          },
          transaction,
        }
      );

      // 记录操作日志
      await OutboundOrderLog.create(
        {
          outbound_order_id: outboundOrder.id,
          action: "confirmed",
          operator_id: req.user.id,
          new_value: {
            status: "confirmed",
            signed_document_url,
            confirmed_at: new Date(),
          },
          details: {
            packages_count: packages.length,
            pallets_shipped: outboundOrder.pallet_numbers,
          },
          notes: notes || "仓库确认出库，已更新相关包裹和板子状态",
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "出库确认成功",
        outbound_number: outboundOrder.outbound_number,
        packages_shipped: packages.length,
        pallets_shipped: outboundOrder.pallet_numbers.length,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("确认出库失败:", error);
      res.status(500).json({ error: "确认出库失败" });
    }
  }
);

// 取消出库单
router.patch(
  "/outbound-orders/:id/cancel",
  authenticate,
  checkPermission("warehouse.outbound.cancel"),
  async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
      const { id } = req.params;
      const { notes } = req.body;

      const outboundOrder = await OutboundOrder.findByPk(id, { transaction });

      if (!outboundOrder) {
        await transaction.rollback();
        return res.status(404).json({ error: "出库单不存在" });
      }

      if (outboundOrder.status !== "pending") {
        await transaction.rollback();
        return res.status(400).json({
          error: "只有待确认状态的出库单才能取消",
        });
      }

      // 更新出库单状态
      await outboundOrder.update(
        {
          status: "cancelled",
          notes: notes || outboundOrder.notes,
        },
        { transaction }
      );

      // 记录操作日志
      await OutboundOrderLog.create(
        {
          outbound_order_id: outboundOrder.id,
          action: "cancelled",
          operator_id: req.user.id,
          old_value: { status: "pending" },
          new_value: { status: "cancelled" },
          notes: notes || "取消出库单",
        },
        { transaction }
      );

      await transaction.commit();

      res.json({
        message: "出库单已取消",
        outbound_number: outboundOrder.outbound_number,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("取消出库单失败:", error);
      res.status(500).json({ error: "取消出库单失败" });
    }
  }
);

export default router;
