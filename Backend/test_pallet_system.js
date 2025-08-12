import db from "./models/index.js";

const { Forecast, Pallet, PalletLog, Package, User } = db;

async function testPalletSystem() {
  console.log("🧪 开始测试 Pallet 系统...\n");

  try {
    // 同步数据库
    console.log("📊 同步数据库模型...");
    await db.sequelize.sync({ force: false });
    console.log("✅ 数据库同步完成\n");

    // 1. 测试创建板
    console.log("📦 测试创建航空板...");

    // 先查找一个现有的预报单，如果没有就创建一个
    let forecast = await Forecast.findOne();
    if (!forecast) {
      forecast = await Forecast.create({
        forecast_code: "FC001",
        agent_id: 1, // 假设存在ID为1的用户
        mawb: "784-12345678",
        flight_no: "CA123",
        departure_port: "PEK",
        destination_port: "LAX",
        weight: 1000.5,
        box_count: 5,
        etd: new Date(),
        eta: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      console.log("✅ 创建测试预报单:", forecast.forecast_code);
    }

    const testPallet = await Pallet.create({
      pallet_code: "PMC001",
      forecast_id: forecast.id,
      pallet_type: "PMC",
      length_cm: 318,
      width_cm: 224,
      height_cm: 162,
      weight_kg: 500.75,
      box_count: 10,
      location_code: "A1-B2-C3",
      operator: "TestUser",
      operator_id: 1,
      remark: "测试航空板",
    });

    console.log("✅ 创建板成功:", {
      id: testPallet.id,
      pallet_code: testPallet.pallet_code,
      status: testPallet.status,
      location_code: testPallet.location_code,
    });

    // 2. 测试入仓操作
    console.log("\n🏭 测试板入仓操作...");
    await testPallet.update({
      status: "stored",
      inbound_time: new Date(),
      position_updated_at: new Date(),
    });

    await PalletLog.create({
      pallet_id: testPallet.id,
      action: "inbound",
      old_status: "pending",
      new_status: "stored",
      new_location: "A1-B2-C3",
      operator: "TestUser",
      operator_id: 1,
      description: "板入仓操作",
    });

    console.log("✅ 板入仓完成，状态:", testPallet.status);

    // 3. 测试拆板操作
    console.log("\n🔧 测试拆板操作...");
    await testPallet.update({
      is_unpacked: true,
      status: "unpacked",
      position_updated_at: new Date(),
    });

    await PalletLog.create({
      pallet_id: testPallet.id,
      action: "unpacked",
      old_status: "stored",
      new_status: "unpacked",
      operator: "TestUser",
      operator_id: 1,
      description: "拆板操作完成",
      metadata: { package_count: testPallet.box_count },
    });

    console.log("✅ 拆板操作完成，is_unpacked:", testPallet.is_unpacked);

    // 4. 测试创建包裹并关联到板
    console.log("\n📮 测试创建包裹并关联到板...");
    const testPackages = [];
    for (let i = 1; i <= 3; i++) {
      const pkg = await Package.create({
        package_code: `PKG00${i}`,
        pallet_id: testPallet.id,
        forecast_id: forecast.id,
        client_id: 1, // 假设存在ID为1的客户
        weight_kg: 10.5 + i,
        status: "prepared",
      });
      testPackages.push(pkg);
    }

    console.log("✅ 创建包裹完成，数量:", testPackages.length);

    // 5. 测试查询板及其包裹
    console.log("\n🔍 测试查询板及其关联数据...");
    const palletWithData = await Pallet.findByPk(testPallet.id, {
      include: [
        {
          model: Forecast,
          as: "forecast",
          attributes: ["id", "forecast_code", "mawb"],
        },
        {
          model: Package,
          as: "packages",
          attributes: ["id", "package_code", "weight_kg", "status"],
        },
        {
          model: PalletLog,
          as: "logs",
          attributes: ["id", "action", "description", "created_at"],
          limit: 5,
          order: [["created_at", "DESC"]],
        },
      ],
    });

    console.log("✅ 查询板详情:");
    console.log("  - 板号:", palletWithData.pallet_code);
    console.log("  - 预报单:", palletWithData.forecast?.forecast_code);
    console.log("  - 包裹数量:", palletWithData.packages?.length);
    console.log("  - 日志记录数:", palletWithData.logs?.length);

    // 6. 测试板状态统计
    console.log("\n📊 测试板状态统计...");
    const statusStats = await Pallet.findAll({
      attributes: [
        "status",
        [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"],
      ],
      group: ["status"],
    });

    console.log("✅ 板状态统计:");
    statusStats.forEach((stat) => {
      console.log(`  - ${stat.status}: ${stat.dataValues.count}个`);
    });

    // 7. 测试板出库
    console.log("\n🚚 测试板出库操作...");
    await testPallet.update({
      status: "dispatched",
      is_full_board: false,
      position_updated_at: new Date(),
    });

    await PalletLog.create({
      pallet_id: testPallet.id,
      action: "dispatched",
      old_status: "unpacked",
      new_status: "dispatched",
      operator: "TestUser",
      operator_id: 1,
      description: "板出库操作",
      metadata: { is_full_board: false },
    });

    console.log("✅ 板出库完成，状态:", testPallet.status);

    // 8. 测试板归还
    console.log("\n🔄 测试板归还操作...");
    await testPallet.update({
      status: "returned",
      returned_time: new Date(),
    });

    await PalletLog.create({
      pallet_id: testPallet.id,
      action: "returned",
      old_status: "dispatched",
      new_status: "returned",
      operator: "TestUser",
      operator_id: 1,
      description: "板归还操作",
    });

    console.log("✅ 板归还完成，状态:", testPallet.status);

    // 9. 测试日志查询
    console.log("\n📋 测试日志查询...");
    const logs = await PalletLog.findAll({
      where: { pallet_id: testPallet.id },
      attributes: [
        "action",
        "old_status",
        "new_status",
        "description",
        "created_at",
      ],
      order: [["created_at", "ASC"]],
    });

    console.log("✅ 板操作日志:");
    logs.forEach((log, index) => {
      console.log(`  ${index + 1}. ${log.action}: ${log.description}`);
      if (log.old_status && log.new_status) {
        console.log(`     状态变更: ${log.old_status} → ${log.new_status}`);
      }
    });

    console.log("\n🎉 Pallet 系统测试完成！所有功能正常工作。");

    // 清理测试数据（可选）
    console.log("\n🧹 清理测试数据...");
    await PalletLog.destroy({ where: { pallet_id: testPallet.id } });
    await Package.destroy({ where: { pallet_id: testPallet.id } });
    await testPallet.destroy();
    console.log("✅ 测试数据清理完成");
  } catch (error) {
    console.error("❌ 测试失败:", error);
    throw error;
  }
}

// 运行测试
testPalletSystem()
  .then(() => {
    console.log("\n✨ 所有测试通过！");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 测试失败:", error.message);
    process.exit(1);
  });
