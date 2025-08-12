// 同步MAWB到包裹的工具函数
import db from "../models/index.js";

/**
 * 当预报单的MAWB更新时，同步更新该预报单下所有包裹的MAWB字段
 * @param {number} forecastId - 预报单ID
 * @param {string} mawb - 新的MAWB号
 * @param {Object} transaction - 数据库事务对象（可选）
 * @returns {Promise<number>} 更新的包裹数量
 */
export async function syncMAWBToPackages(forecastId, mawb, transaction = null) {
  try {
    const updateOptions = {
      where: { forecast_id: forecastId },
    };

    if (transaction) {
      updateOptions.transaction = transaction;
    }

    const updateResult = await db.Package.update({ mawb: mawb }, updateOptions);

    console.log(
      `已同步MAWB(${mawb})到预报单${forecastId}的${updateResult[0]}个包裹`
    );
    return updateResult[0]; // 返回更新的记录数
  } catch (error) {
    console.error(`同步MAWB到包裹失败:`, error);
    throw new Error(`同步MAWB到包裹失败: ${error.message}`);
  }
}

/**
 * 当预报单的HAWB更新时，同步更新特定包裹的HAWB字段
 * @param {number} packageId - 包裹ID
 * @param {string} hawb - 新的HAWB号
 * @param {Object} transaction - 数据库事务对象（可选）
 * @returns {Promise<boolean>} 是否更新成功
 */
export async function syncHAWBToPackage(packageId, hawb, transaction = null) {
  try {
    const updateOptions = {
      where: { id: packageId },
    };

    if (transaction) {
      updateOptions.transaction = transaction;
    }

    const updateResult = await db.Package.update({ hawb: hawb }, updateOptions);

    console.log(`已同步HAWB(${hawb})到包裹${packageId}`);
    return updateResult[0] > 0; // 返回是否更新成功
  } catch (error) {
    console.error(`同步HAWB到包裹失败:`, error);
    throw new Error(`同步HAWB到包裹失败: ${error.message}`);
  }
}

/**
 * 批量同步HAWB到多个包裹
 * @param {Array} packageIds - 包裹ID数组
 * @param {string} hawb - 新的HAWB号
 * @param {Object} transaction - 数据库事务对象（可选）
 * @returns {Promise<number>} 更新的包裹数量
 */
export async function syncHAWBToPackages(packageIds, hawb, transaction = null) {
  try {
    const updateOptions = {
      where: {
        id: {
          [db.Sequelize.Op.in]: packageIds,
        },
      },
    };

    if (transaction) {
      updateOptions.transaction = transaction;
    }

    const updateResult = await db.Package.update({ hawb: hawb }, updateOptions);

    console.log(`已同步HAWB(${hawb})到${updateResult[0]}个包裹`);
    return updateResult[0]; // 返回更新的记录数
  } catch (error) {
    console.error(`批量同步HAWB到包裹失败:`, error);
    throw new Error(`批量同步HAWB到包裹失败: ${error.message}`);
  }
}
