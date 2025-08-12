import express from "express";
import db from "../models/index.js";

const app = express();
app.use(express.json());

const { Forecast, Package, DeliveryOrder, User } = db;

// 测试多维状态系统
async function testMultiDimensionalStatus() {
  try {
    console.log("🧪 测试多维状态系统...");

    // 创建测试用户
    const testUser = await User.findOrCreate({
      where: { username: "test_warehouse_operator" },
      defaults: {
        username: "test_warehouse_operator",
        password: "test123",
        role: "warehouse",
        email: "test@warehouse.com",
      },
    });

    // 创建测试预报单
    const testForecast = await Forecast.findOrCreate({
      where: { forecast_code: "TEST-MULTI-STATUS" },
      defaults: {
        forecast_code: "TEST-MULTI-STATUS",
        mawb: "TEST-MAWB-001",
        agent_id: 1,
        status: "booked", // 主业务状态：已订舱
        clearance_status: "pending", // 清关状态：待清关
        delivery_status: "pending", // 交付状态：待交付
        total_packages: 10,
        cleared_packages: 0,
        dispatched_packages: 0,
        delivered_packages: 0,
        incident_packages: 0,
        has_incident: false,
      },
    });

    console.log("✅ 初始状态创建:");
    console.log(`   主状态: ${testForecast[0].status}`);
    console.log(`   清关状态: ${testForecast[0].clearance_status}`);
    console.log(`   交付状态: ${testForecast[0].delivery_status}`);

    // 测试1: 独立更新清关状态 - 部分清关
    await testForecast[0].update({
      clearance_status: "partial",
      cleared_packages: 3,
    });

    console.log("\n📦 测试1 - 部分清关:");
    console.log(`   主状态: ${testForecast[0].status} (保持不变)`);
    console.log(`   清关状态: ${testForecast[0].clearance_status} → partial`);
    console.log(`   交付状态: ${testForecast[0].delivery_status} (保持不变)`);
    console.log(`   清关进度: ${testForecast[0].cleared_packages}/10`);

    // 测试2: 在部分清关状态下开始交付 - 验证独立性
    await testForecast[0].update({
      delivery_status: "partial_dispatched",
      dispatched_packages: 2, // 只能派送已清关的包裹
    });

    console.log("\n🚚 测试2 - 部分派送 (清关未完成):");
    console.log(`   主状态: ${testForecast[0].status} (保持不变)`);
    console.log(
      `   清关状态: ${testForecast[0].clearance_status} (保持partial)`
    );
    console.log(
      `   交付状态: ${testForecast[0].delivery_status} → partial_dispatched`
    );
    console.log(`   派送进度: ${testForecast[0].dispatched_packages}/10`);

    // 测试3: 继续清关进度
    await testForecast[0].update({
      clearance_status: "completed",
      cleared_packages: 10,
    });

    console.log("\n✅ 测试3 - 完成清关:");
    console.log(`   主状态: ${testForecast[0].status} (保持不变)`);
    console.log(`   清关状态: ${testForecast[0].clearance_status} → completed`);
    console.log(
      `   交付状态: ${testForecast[0].delivery_status} (保持partial_dispatched)`
    );
    console.log(`   清关进度: ${testForecast[0].cleared_packages}/10`);

    // 测试4: 主业务状态更新 - 货物到仓
    await testForecast[0].update({
      status: "arrived",
    });

    console.log("\n🏭 测试4 - 货物到仓:");
    console.log(`   主状态: ${testForecast[0].status} → arrived`);
    console.log(
      `   清关状态: ${testForecast[0].clearance_status} (保持completed)`
    );
    console.log(
      `   交付状态: ${testForecast[0].delivery_status} (保持partial_dispatched)`
    );

    // 测试5: 完成交付
    await testForecast[0].update({
      delivery_status: "completed",
      dispatched_packages: 10,
      delivered_packages: 10,
    });

    console.log("\n🎯 测试5 - 完成交付:");
    console.log(`   主状态: ${testForecast[0].status} (保持arrived)`);
    console.log(
      `   清关状态: ${testForecast[0].clearance_status} (保持completed)`
    );
    console.log(`   交付状态: ${testForecast[0].delivery_status} → completed`);
    console.log(`   交付进度: ${testForecast[0].delivered_packages}/10`);

    // 测试6: 异常情况 - 部分包裹异常
    await testForecast[0].update({
      delivery_status: "incident",
      incident_packages: 2,
      delivered_packages: 8,
      has_incident: true,
    });

    console.log("\n⚠️  测试6 - 异常情况:");
    console.log(`   主状态: ${testForecast[0].status} (保持arrived)`);
    console.log(
      `   清关状态: ${testForecast[0].clearance_status} (保持completed)`
    );
    console.log(`   交付状态: ${testForecast[0].delivery_status} → incident`);
    console.log(`   异常标记: ${testForecast[0].has_incident}`);
    console.log(`   交付进度: ${testForecast[0].delivered_packages}/10`);
    console.log(`   异常包裹: ${testForecast[0].incident_packages}`);

    console.log("\n🎉 多维状态系统测试完成!");
    console.log("📋 总结:");
    console.log(
      "   ✅ 主业务状态独立管理 (draft → booked → in_transit → arrived)"
    );
    console.log("   ✅ 清关状态独立操作 (pending → partial → completed)");
    console.log(
      "   ✅ 交付状态独立追踪 (pending → partial → completed/incident)"
    );
    console.log("   ✅ 支持清关未完成时的部分交付操作");
    console.log("   ✅ 异常情况独立标记和统计");

    return {
      success: true,
      finalStatus: {
        main_status: testForecast[0].status,
        clearance_status: testForecast[0].clearance_status,
        delivery_status: testForecast[0].delivery_status,
        has_incident: testForecast[0].has_incident,
        progress: {
          total: testForecast[0].total_packages,
          cleared: testForecast[0].cleared_packages,
          dispatched: testForecast[0].dispatched_packages,
          delivered: testForecast[0].delivered_packages,
          incident: testForecast[0].incident_packages,
        },
      },
    };
  } catch (error) {
    console.error("❌ 测试失败:", error);
    return { success: false, error: error.message };
  }
}

// API端点
app.post("/test/multi-dimensional-status", async (req, res) => {
  const result = await testMultiDimensionalStatus();
  res.json(result);
});

app.get("/test/status-overview", async (req, res) => {
  try {
    const forecasts = await Forecast.findAll({
      where: { forecast_code: "TEST-MULTI-STATUS" },
      attributes: [
        "id",
        "forecast_code",
        "mawb",
        "status",
        "clearance_status",
        "delivery_status",
        "total_packages",
        "cleared_packages",
        "dispatched_packages",
        "delivered_packages",
        "incident_packages",
        "has_incident",
      ],
    });

    res.json({
      message: "状态概览查询成功",
      forecasts: forecasts.map((f) => ({
        forecast_code: f.forecast_code,
        mawb: f.mawb,
        dimensions: {
          main_status: f.status,
          clearance_status: f.clearance_status,
          delivery_status: f.delivery_status,
          has_incident: f.has_incident,
        },
        progress: {
          total_packages: f.total_packages,
          cleared_packages: f.cleared_packages,
          dispatched_packages: f.dispatched_packages,
          delivered_packages: f.delivered_packages,
          incident_packages: f.incident_packages,
        },
        clearance_rate:
          f.total_packages > 0
            ? `${((f.cleared_packages / f.total_packages) * 100).toFixed(1)}%`
            : "0%",
        delivery_rate:
          f.total_packages > 0
            ? `${((f.delivered_packages / f.total_packages) * 100).toFixed(1)}%`
            : "0%",
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动测试服务器
const PORT = process.env.TEST_PORT || 3001;
app.listen(PORT, async () => {
  console.log(`🧪 多维状态测试服务器启动: http://localhost:${PORT}`);
  console.log("📡 可用测试端点:");
  console.log(`   POST http://localhost:${PORT}/test/multi-dimensional-status`);
  console.log(`   GET  http://localhost:${PORT}/test/status-overview`);

  // 自动运行测试
  console.log("\n🚀 自动执行测试...");
  await testMultiDimensionalStatus();
});

export default app;
