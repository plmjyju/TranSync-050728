# TranSync 前端 Copilot 提示语模板（Vue 3 + Vite + JS）

说明

- 复制以下模板到 Copilot Chat 或注释中，按需替换占位符。
- 统一遵循 `.github/copilot-frontend.md` 与 `.github/copilot-instructions.md` 规范。

通用代码风格与约束（在每次生成前提醒）

- 使用 Vue 3 + Vite + JavaScript（非 TS）。
- UI 使用 Element Plus；状态用 Pinia；路由用 Vue Router；HTTP 用 Axios（src/api/http.js）。
- 所有 API 都通过 http 实例发起，自动注入 Authorization。
- 列表页实现分页/过滤/排序；解析响应字段 packages|data|rows 与 total|count。
- 错误提示显示后端 message，401 跳转 /login。

1. 生成登录页（Agent）
   我要一个 Agent 登录页（/login）：

- 使用 Element Plus 的表单组件，字段 username/password；回车提交。
- 提交 POST /api/common/auth/login/agent；成功后将 token 写入 localStorage.token_agent 与 Pinia；跳转 /agent/packages。
- 失败显示后端 message；按钮有 loading；整体居中卡片布局。

2. 生成 Agent 包裹列表页
   我要一个 /agent/packages 页面：

- 顶部：输入框 q，状态下拉 status，查询按钮；分页 page/limit。
- 请求 GET /api/agent/packages，带上 { page, limit, q, status }。
- 表格列：package_code、status、inbond_id、client_name、created_at。
- 使用 el-table + el-pagination；loading 状态；错误 toast。

3. 封装 API 模块（可选）
   请为 Agent 封装 API 模块 src/api/agent.js：

- listPackages(params) -> GET /api/agent/packages
- scanReceive(body) -> POST /api/agent/packages/scan/receive
- scanReceiveBatch(body) -> POST /api/agent/packages/scan/receive-batch
- 使用 http 实例；导出具名方法。

4. 路由与守卫
   请创建 src/router/index.js 并添加守卫：

- 路由：/login, /agent/packages；/ 重定向到 /agent/packages。
- 守卫：meta.requiresAgent 的路由需要 token_agent，否则跳转 /login。

5. 全局 HTTP 拦截器
   请创建 src/api/http.js：

- baseURL = import.meta.env.VITE_API_BASE；超时 15s。
- 请求拦截器：将 localStorage.token_agent 注入 Authorization。
- 响应拦截器：捕获 401，清空 token 并跳转 /login；导出实例。

6. Pinia Store
   请创建 src/store/auth.js：

- state: token（默认 localStorage.token_agent）；actions: setToken/logout。
- setToken 更新 Pinia 与 localStorage。

7. 表单与校验
   请使用 Element Plus Form 做前端校验：

- 必填项必须加 prop 与 rules；提交前 validate。

8. 错误码处理
   后端失败模式 { success:false, code, message }：

- UI 优先展示 message；在控制台打印 code 以便排查；不要泄露敏感数据。

9. 代码组织

- 页面逻辑放 methods/computed；可复用逻辑抽到 composables/。
- 组件 Props 命名使用小驼峰；事件使用 update:modelValue 或自定义事件。

10. 生成自检清单（随 PR 提交）
    请生成一段变更说明，回答：

- 是否遵循 http 封装与 token 注入？
- 是否实现分页与过滤参数并与后端一致？
- 是否添加路由守卫并验证未登录跳转？
- 是否对错误进行统一提示处理？
- 是否避免泄露 token？

---

11. 动态路由 + 权限注入（Agent/Client 任一端）
    请为当前端实现基于权限的动态路由：

- 新增 router/dynamic.js，导出 setupDynamicRoutes(perms)、resetRouter(router)、buildMenuTree(routes)；
- 候选路由放在 router/modules/\*\*/routes.js，写上 meta.permissions、meta.requiresAgent/Client、meta.title、meta.icon；
- 应用启动与登录成功时：解析 token.permissions（若无则调用 /me），然后按权限 addRoute 注入；
- 在 Axios 401 时清理当前 token，调用 resetRouter(router) 并跳转对应登录页；
- 新增 /403 与 /404 页面。

12. 权限工具与指令
    请创建 permissions/index.js：

- 导出 hasPerm(...perms)、hasAnyPerm(...perms)；内部从 Pinia 或 JWT 解码获取权限集合；
- 导出 v-permission 指令：当无权限时隐藏元素或禁用元素（可配置模式）。

13. 菜单由路由派生
    请新增 UI store 与菜单构建：

- 从 router.getRoutes() 读取可访问路由，过滤 meta.hideInMenu，按 meta.order 排序；
- 生成可渲染的菜单树（title/icon/path/children）；
- 登录或权限变化时重建菜单。

14. 权限版本 + 远端模块开关（可选）

- 在 /me 返回 permsVersion 与 moduleEnabled；
- 前端缓存 permsVersion，变化时 resetRouter + 重新注入；
- 过滤候选路由时同时校验 moduleEnabled 和 meta.featureFlag。

15. 自检清单（动态路由）

- 是否把 /login,/403,/404 放入白名单静态路由？
- 是否实现了 setupDynamicRoutes 并在启动/登录时调用？
- 是否在 401 时清理 token 并 resetRouter？
- 是否由路由派生菜单，避免双维护？
- 是否使用 hasPerm/v-permission 控制按钮/列可见性？

附：请求示例
GET /api/agent/packages?page=1&limit=20&q=ABC&status=received
Authorization: Bearer <token_agent>
