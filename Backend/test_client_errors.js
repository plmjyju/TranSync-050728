// test_client_errors.js
import fetch from "node-fetch";

const BASE_URL = "http://localhost:3000/api/client";

// 测试函数
async function testClientErrors() {
  console.log("🧪 开始测试客户端错误处理...\n");

  // 测试1: 无Token访问
  console.log("📝 测试1: 无Token访问受保护接口");
  try {
    const response = await fetch(`${BASE_URL}/profile`);
    const data = await response.json();
    console.log("状态码:", response.status);
    console.log("响应:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.log("错误:", error.message);
  }
  console.log("");

  // 测试2: 无效登录
  console.log("📝 测试2: 无效用户名密码");
  try {
    const response = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "invalid_user",
        password: "invalid_pass",
      }),
    });
    const data = await response.json();
    console.log("状态码:", response.status);
    console.log("响应:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.log("错误:", error.message);
  }
  console.log("");

  // 测试3: 缺少登录参数
  console.log("📝 测试3: 缺少登录参数");
  try {
    const response = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "client001",
        // 缺少password
      }),
    });
    const data = await response.json();
    console.log("状态码:", response.status);
    console.log("响应:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.log("错误:", error.message);
  }
  console.log("");

  // 测试4: 正确登录
  console.log("📝 测试4: 正确登录");
  try {
    const response = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "client001",
        password: "password123",
      }),
    });
    const data = await response.json();
    console.log("状态码:", response.status);
    console.log("响应:", JSON.stringify(data, null, 2));

    if (data.success && data.token) {
      console.log("✅ 登录成功，Token获取成功");

      // 测试5: 使用有效Token访问
      console.log("\n📝 测试5: 使用有效Token访问用户信息");
      const profileResponse = await fetch(`${BASE_URL}/profile`, {
        headers: {
          Authorization: `Bearer ${data.token}`,
        },
      });
      const profileData = await profileResponse.json();
      console.log("状态码:", profileResponse.status);
      console.log("响应:", JSON.stringify(profileData, null, 2));
    }
  } catch (error) {
    console.log("错误:", error.message);
  }

  console.log("\n✅ 错误处理测试完成！");
}

// 运行测试
testClientErrors();
