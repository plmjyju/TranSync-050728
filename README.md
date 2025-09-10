# TranSync FTZ Warehouse Management System

> Documentation index: see `Backend/docs/index.md` (new structured docs with architecture, workflows, API, security, testing, deprecated).

## 项目简介

TranSync 是一个面向保税仓库的仓库管理系统，支持多仓库、多租户的操作。系统分为以下模块：

### 1. OMP（运营管理平台）

- **功能**：
  - 多仓管理（新增仓库、分配管理员）
  - 用户/角色/权限管理（含 WMS、货代、客户端账号）
  - 系统配置（提单规则、报表模板等）
  - 全局库存统计和操作日志审计
  - 多租户支持（未来可开 SaaS）

### 2. WMS（仓库端）

- **功能**：
  - 入库：扫码入库、按提单验收
  - 出库：扫码出库、生成转关单
  - 库内：库存查看、盘点、移位、异常登记
  - 操作员权限：仅能操作本仓库的货物

### 3. 货代端

- **功能**：
  - 提单上传（HAWB/MAWB）、箱单上传
  - 入仓预约（生成入库单）
  - 出库申请（如转关出口、分拨等）
  - 查件追踪、查库存（权限范围内）

### 4. 客户端

- **功能**：
  - 包裹预报（填写预报信息，上传身份证等）
  - 查看货物状态（已到仓、已出库）
  - 在线提交出库申请
  - 快递单/转单追踪

## 技术栈

- **后端**：Node.js + Express + Sequelize
- **认证**：JWT
- **数据库**：MySQL
- **前端**：React 或 Vue（可选）
- **实时通知**：WebSocket 或 RabbitMQ

## 项目结构

```
Backend/
├── index.js                # 主入口文件
├── package.json            # 项目依赖
├── middlewares/            # 中间件
│   ├── authenticate.js     # JWT认证
│   ├── checkPermission.js  # 权限检查
├── models/                 # 数据库模型
│   ├── index.js            # Sequelize初始化
│   ├── User.js             # 用户模型
│   ├── Role.js             # 角色模型
│   ├── Permission.js       # 权限模型
│   ├── RolePermission.js   # 角色权限关联
├── routes/                 # 路由
│   ├── inbound.js          # 入库相关路由
│   ├── auth.js             # 登录认证路由
│   ├── admin.js            # 管理员相关路由
├── seed/                   # 数据初始化脚本
│   ├── permissions.js      # 权限种子数据
```

## 安装与运行

1. 克隆项目：

   ```bash
   git clone <repository-url>
   ```

2. 安装依赖：

   ```bash
   npm install
   ```

3. 配置环境变量：
   在项目根目录创建 `.env` 文件，填写以下内容：

   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=transync
   DB_USER=root
   DB_PASS=yourpassword
   JWT_SECRET=yourjwtsecret
   ```

4. 启动项目：
   ```bash
   npm start
   ```

## API 文档

### `/api/auth/login`

- **方法**：POST
- **描述**：用户登录，返回 JWT
- **请求体**：
  ```json
  {
    "username": "admin",
    "password": "password",
    "client_type": "omp"
  }
  ```
- **响应**：
  ```json
  {
    "token": "jwt-token",
    "user": {
      "id": 1,
      "username": "admin",
      "name": "Admin User",
      "client_type": "omp",
      "role_id": 2
    }
  }
  ```

### `/api/admin/register-forwarder`

- **方法**：POST
- **描述**：管理员注册货代账号
- **请求体**：
  ```json
  {
    "username": "forwarder1",
    "password": "securepassword",
    "full_name": "Forwarder Company",
    "email": "contact@forwarder.com"
  }
  ```
- **响应**：
  ```json
  {
    "message": "Forwarder registered successfully",
    "user": {
      "id": 1,
      "username": "forwarder1",
      "full_name": "Forwarder Company",
      "email": "contact@forwarder.com",
      "client_type": "forwarder",
      "status": "active"
    }
  }
  ```

## 统一认证与权限初始化说明 (2025-08-19 更新)

- 唯一认证中间件: `Backend/middlewares/authenticate.js`
  - 所有路由必须引用该文件 (默认导出或具名 `{ authenticate }`).
  - 旧路径 `Backend/middleware/auth.js` 已移除并备份，不再使用。
- 权限与角色初始化: 仅保留脚本 `seed/initPermissionsAndRoles.js` + 数据源 `seed/permissions.js`。
  - 初始化命令: `npm run seed:permissions`
  - 新增权限请修改 `seed/permissions.js` 后重新执行初始化脚本。
- 原一次性/测试脚本已迁移至 `_backup_removed_20250819/`，生产部署不再包含。

## 贡献

欢迎提交问题或贡献代码！
