// utils/generateHAWB.js
import db from "../models/index.js";

/**
 * 生成HAWB号码
 * 格式：HAWB + 年月日 + 流水号（3位）
 * 例如：HAWB250806001
 */
const generateHAWB = async () => {
  const today = new Date();
  const dateStr = today.toISOString().slice(2, 10).replace(/-/g, ""); // 250806 格式

  try {
    // 查找当天已生成的HAWB数量
    const existingCount = await db.Forecast.count({
      where: {
        hawb: {
          [db.Sequelize.Op.like]: `HAWB${dateStr}%`,
        },
      },
    });

    // 生成新的HAWB号
    const hawbNumber = `HAWB${dateStr}${String(existingCount + 1).padStart(
      3,
      "0"
    )}`;

    return hawbNumber;
  } catch (error) {
    console.error("生成HAWB号失败:", error);
    // 如果数据库查询失败，使用时间戳作为后备方案
    const timestamp = Date.now().toString().slice(-6);
    return `HAWB${dateStr}${timestamp}`;
  }
};

/**
 * 验证HAWB号格式
 * @param {string} hawb - HAWB号
 * @returns {boolean} - 是否为有效格式
 */
const validateHAWB = (hawb) => {
  const hawbPattern = /^HAWB\d{6}\d{3,6}$/;
  return hawbPattern.test(hawb);
};

export default generateHAWB;
export { generateHAWB, validateHAWB };
