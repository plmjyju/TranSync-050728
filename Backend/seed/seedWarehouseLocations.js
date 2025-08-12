import db from "../models/index.js";
import defaultLocations from "./warehouse-locations.js";

const { WarehouseLocation, User } = db;

async function seedWarehouseLocations() {
  try {
    console.log("开始初始化仓库库位...");

    // 检查是否已经有数据
    const existingCount = await WarehouseLocation.count();
    if (existingCount > 0) {
      console.log(`已存在 ${existingCount} 个库位，跳过初始化`);
      return;
    }

    // 获取第一个管理员用户作为创建人
    const adminUser = await User.findOne({
      where: { role: "omp" },
      order: [["id", "ASC"]],
    });

    if (!adminUser) {
      console.log("未找到管理员用户，使用默认创建人ID: 1");
    }

    const createdBy = adminUser ? adminUser.id : 1;

    // 为每个库位添加创建人信息
    const locationsWithCreator = defaultLocations.map((location) => ({
      ...location,
      created_by: createdBy,
      is_active: true,
      current_occupancy: 0,
    }));

    // 批量创建默认库位
    const created = await WarehouseLocation.bulkCreate(locationsWithCreator, {
      ignoreDuplicates: true,
    });

    console.log(`✅ 成功创建 ${created.length} 个默认库位`);

    // 按区域显示创建的库位
    const locationsByZone = {};
    defaultLocations.forEach((location) => {
      if (!locationsByZone[location.warehouse_zone]) {
        locationsByZone[location.warehouse_zone] = [];
      }
      locationsByZone[location.warehouse_zone].push(location.location_code);
    });

    console.log("\n📦 库位创建详情:");
    Object.entries(locationsByZone).forEach(([zone, locations]) => {
      console.log(`  ${zone}区: ${locations.join(", ")}`);
    });

    console.log("\n🏷️  库位类型说明:");
    console.log("  - standard: 标准存储库位");
    console.log("  - cold_storage: 冷库存储库位");
    console.log("  - hazmat: 危险品存储库位");
    console.log("  - oversized: 超大件存储库位");
    console.log("  - secure: 安全存储库位");
    console.log("  - staging: 暂存区库位");
    console.log("  - temporary: 临时库位");
  } catch (error) {
    console.error("❌ 初始化仓库库位失败:", error);
    throw error;
  }
}

// 如果直接运行此文件，则执行初始化
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await db.sequelize.sync({ alter: true });
    await seedWarehouseLocations();
    console.log("仓库库位初始化完成");
    process.exit(0);
  } catch (error) {
    console.error("初始化失败:", error);
    process.exit(1);
  }
}

export default seedWarehouseLocations;
