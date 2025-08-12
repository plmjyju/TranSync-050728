import db from "../models/index.js";

const { DeliveryOrder } = db;

/**
 * 生成唯一的DO号
 * 格式：DO250802-01
 * @returns {Promise<string>} 生成的DO号
 */
export async function generateDONumber() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // 25
  const month = String(now.getMonth() + 1).padStart(2, "0"); // 08
  const day = String(now.getDate()).padStart(2, "0"); // 02

  const datePrefix = `DO${year}${month}${day}`;

  // 查找今天已有的DO号数量
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const existingCount = await DeliveryOrder.count({
    where: {
      created_at: {
        [db.Sequelize.Op.gte]: today,
        [db.Sequelize.Op.lt]: tomorrow,
      },
    },
  });

  // 生成序号，从01开始
  const sequence = String(existingCount + 1).padStart(2, "0");

  return `${datePrefix}-${sequence}`;
}

/**
 * 验证DO号是否已存在
 * @param {string} doNumber DO号
 * @returns {Promise<boolean>} 是否已存在
 */
export async function isDONumberExists(doNumber) {
  const existing = await DeliveryOrder.findOne({
    where: { do_number: doNumber },
  });
  return !!existing;
}
