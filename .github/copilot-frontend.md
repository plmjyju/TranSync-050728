# TranSync 前端（Vue 3 + Vite + JS）Copilot 指示文档（2025-08-31）

目的

- 让 Copilot 在本仓库中生成前端代码时，遵循统一技术栈与规范，产出可直接集成后端的高质量代码。
- 对齐后端 AI 指南（.github/copilot-instructions.md），保持鉴权/权限、错误码、分页与过滤的一致性。

语言

- 默认使用简体中文（注释、文档、提交信息）。通用技术名词保留英文。

技术栈与边界

- 框架：Vue 3（Composition/Options 任意其一，保持一致）。
- 构建：Vite。
- 语言：JavaScript（非 TypeScript）。
- UI：Element Plus。
- 状态：Pinia。
- 路由：Vue Router。
- HTTP：Axios（统一封装在 src/api/http.js）。
- 环境变量：VITE_API_BASE 指向后端（默认 http://localhost:3000）。

目录结构（建议）

- src/
  - main.js
  - App.vue
  - router/index.js
  - store/
    - auth.js
  - api/
    - http.js
    - agent.js（可选：封装 Agent API）
  - views/
    - Login.vue
    - AgentPackages.vue
  - components/（通用组件）
  - composables/（可选：组合式复用逻辑）

HTTP 客户端规范（必须）

- 统一使用 src/api/http.js 创建的 Axios 实例；禁止页面直接使用 fetch。
- 请求拦截器：
  - 从 localStorage 读取 token，键名：token_agent / token_client / token_warehouse（视当前端身份）。
  - 若存在则设置 Authorization: Bearer <token>。
- 响应拦截器（可选）：
  - 统一处理 401（跳转 /login，清空 token）。
  - 解析标准响应：
    - 成功：{ success: true, message, ...data }
    - 失败：{ success: false, code, message, ...context }

鉴权与路由守卫

- 路由项通过 meta.requiresAgent / requiresClient / requiresWarehouse 标示需要的登录态。
- 全局 beforeEach：
  - 未登录访问受保护路由时，跳转 /login。
  - 登录后访问 /login，重定向到模块主页（例如 /agent/packages）。
- 登录接口：/api/common/auth/login/{agent|warehouse} 或 /api/client/login。
- 登录成功后将 token 写入对应 localStorage 键，并在 Pinia 内镜像保存。

权限（前端可见性）

- 后端强制检查权限；前端仅做可见性控制避免误操作。
- 若 token.permissions 存在：
  - 使用 includes('agent.package.view') 等字符串控制按钮/菜单显示。
  - 不要在前端放宽任何后端约束。

分页、排序、过滤（与后端一致）

- 列表页查询参数：
  - 分页：page, limit（或 pageSize；两者后端已有兼容时均可）。
  - 搜索：q。
  - 字段过滤：status, inbond_id 等。
  - 时间范围：date_from, date_to，可选 date_field（如 created_at）。
  - 排序：order_by, order_dir。
- 响应解析：
  - 列表数据：优先 packages；若无则 data/rows。
  - 总数：优先 total；若无则 count。
- UI：Element Plus 的 el-table + el-pagination，保持 loading 与空态提示。

错误处理与提示

- 失败响应优先显示 message；如无则显示“操作失败”。
- 重要操作前使用确认弹窗；成功后 toast 成功并刷新数据。
- 开发时避免在控制台打印包含 token 的敏感信息。

Agent 包裹列表页（基线要求）

- 目标接口：GET /api/agent/packages。
- 需求：
  - 支持分页（page/limit）、搜索（q）、状态过滤（status）。
  - 表格列：package_code、status、inbond_id、client_name（若后端返回）、created_at。
  - 顶部工具条：输入框（q）、下拉（status）、查询按钮。
  - 进入页面即加载一次，切换分页/尺寸时重新加载。
- 注意：后端已按 Agent 所属客户做数据隔离，前端无需额外过滤，仅需携带 Authorization。

登录页（Agent）

- 表单字段：username, password。
- 提交到 /api/common/auth/login/agent。
- 成功：保存 token 到 localStorage.token_agent 与 Pinia，跳转 /agent/packages。
- 失败：展示后端 message。

代码风格与命名

- 组件文件：PascalCase；变量/方法：camelCase。
- 组件命名：功能优先（如 AgentPackages.vue、Login.vue）。
- 统一使用 async/await；注意 try/catch；保证 finally 中正确复位 loading。

性能与可维护性

- 避免在模板中声明复杂表达式；将计算移至 computed。
- 可复用逻辑抽到 composables/；可复用 UI 抽到 components/。
- 避免重复的 API 参数名硬编码，封装小函数统一构建查询参数。

可选增强

- i18n：如需多语言可引入 vue-i18n，默认中文。
- ESLint/Prettier：推荐在前端子项目中配置以统一风格。

修改检查清单（前端）

1. 是否使用 src/api/http.js 发送请求？（Y/N）
2. 是否正确携带 Authorization 头（读取对应 token\_\*）？（Y/N）
3. 列表是否实现分页/过滤，并与后端字段一致？（Y/N）
4. 是否对错误做了统一提示？（Y/N）
5. 路由是否加了登录态守卫？（Y/N）
6. 是否避免在代码/日志中泄露 token 等敏感信息？（Y/N）
7. UI 是否使用 Element Plus 且交互一致（loading/空态/确认）？（Y/N）

示例片段（仅示意，避免重复造轮子）

- 发起请求：
  // http 已注入 token
  // const { data } = await http.get('/api/agent/packages', { params: { page, limit, q, status } });

- 路由守卫：
  // if (to.meta.requiresAgent && !token) return next('/login');

---

## 组合式 API（Composition）约定（必须）

- 新增/重构页面一律使用组合式 `<script setup>`，不再新增 Options API。
- 逻辑复用优先 composables/ 与基础部件 slots/props，而非在页面内复制逻辑。
- 事件/状态管理：
  - 路由：`useRoute()/useRouter()`；
  - 通知：Element Plus 的 `ElMessage/ElNotification`；
  - 加载/错误：统一 try/catch + finally 复位 loading；
  - 自适应高度：继续使用 BaseTableSection 的 `numericTableHeight` 与页面内 `computeAutoHeights()`。

已迁移（样例）
- `frontend-client/src/views/Packages.vue` → 组合式（<script setup>）+ `BasePageLayout` + `BaseToolbar` + `InbondListSection`。
- `frontend-client/src/views/Inbonds.vue` → 作为布局与高度算法基线（后续也建议迁移为组合式）。

---

## 统一样式与部件库规范（必须）

目标

- 样式集中与主题化：颜色/间距/圆角/阴影/字体等“设计令牌”统一管理；禁止页面内写魔法数与行内样式。
- 高复用部件：页面只组合基础部件与业务 Section，差异通过插槽/配置（如不同按钮）实现。

样式目录与主题

- src/styles/
  - tokens.scss：设计令牌（Design Tokens）
    - 颜色：--color-primary、--color-success、--color-warning、--color-text-1/2/3、--color-bg-1/2
    - 间距：--space-1..6（4/8/12/16/20/24）
    - 圆角：--radius-sm/md/lg（6/8/12）
    - 阴影：--shadow-1/2
    - 字体：--font-size-sm/md/lg、--line-height-base
    - 组件尺寸：--toolbar-height、--section-gap、--card-padding
    - 映射 Element Plus：--el-color-primary、--el-border-radius-base、--el-text-color-primary 等指向上述令牌
  - base.css：Reset/排版/滚动条/页面容器
  - utilities.css：工具类（m/p 间距、flex、对齐、省略、多行省略）
  - components/
    - layout.css（页框/卡片/分区）
    - table.css（表格外观统一与 Element Plus 细节覆写）
    - form.css（表单项间距/校验提示）
    - toolbar.css（查询工具条高度/间距/分隔）
  - theme-light.scss、theme-dark.scss（可选：主题覆盖）

命名与禁止项

- 命名：BEM（.toolbar、.toolbar__left、.toolbar__right、.card--ghost）。
- 禁止：行内样式、硬编码像素（magic numbers）、在页面/业务组件内新增局部 CSS；尽量使用 utilities.css 与 tokens 变量。
- 禁止：在模板属性中插入 HTML 注释。

部件分层与目录

- src/components/base/（基础通用）
  - BasePageLayout.vue：页面骨架（header/toolbar/content/footer 插槽）
  - BaseToolbar.vue：工具条（统一高度/间距），提供 filters 与 actions 插槽
  - BaseFormSection.vue：表单分区（统一标题/留白）
  - BaseTableSection.vue：表格容器（保留既有 :height="numericTableHeight" 与 pager-bar 约束）
  - （可选）BaseDialogForm.vue、BaseConfirmButton.vue
- src/components/sections/（业务拼装）
  - 例如 InbondListSection：组合 BaseToolbar + BaseTableSection；通过 插槽/props 定制按钮与列

基础部件约定（API 摘要）

- BasePageLayout
  - slots：header、toolbar、default（内容）、footer
  - props：dense（boolean）、noPadding（boolean）
- BaseToolbar
  - props：gap（默认使用 --space-3）、align（'left'|'between'）、loading（boolean）
  - emits：search、reset
  - slots：filters（左侧筛选）、actions（右侧按钮）
  - 差异化按钮：优先用 actions 插槽；如需列表渲染，支持 actions=[{label,icon,perm,type,handler}]（可选）
- BaseTableSection（现有）
  - 约束：:height="numericTableHeight"；pager 容器类名固定为 pager-bar；依赖 viewportH 触发重算
  - 样式：外观统一在 styles/components/table.css 覆盖，不在页面内写样式

复用策略

- “只差按钮”场景：通过 BaseToolbar 的 actions 插槽或 actions 配置数组；禁止在业务 Section 内写死具体按钮。
- 页面样式统一由 Base 组件 + utilities 完成；页面不得新增自定义 CSS。
- 颜色/间距/圆角/阴影：只使用 tokens.scss 定义的变量。

迁移步骤（建议）

1) 引入样式体系：新增 src/styles/*；在 main.js 全局引入 base.css、tokens.scss、theme-light.scss、utilities.css、components/*.css。
2) 抽象工具条与页框：将各页顶部查询区域替换为 BaseToolbar；用 BasePageLayout 包裹页面。
3) 表格统一：将表格外观统一迁移到 styles/components/table.css；不改 BaseTableSection 高度算法。
4) 批量迁移页面：优先 Inbonds.vue、Packages.vue、AirWaybills.vue；移除行内样式与魔法数，替换为工具类与令牌。
5) 文档同步：更新本文“统一样式与部件库规范/实时约束/维护指引”与动态路由登记。

提交前检查（样式与部件）

- 是否仅使用 tokens.scss 的变量与 utilities.css 工具类？（Y/N）
- 是否使用 BasePageLayout + BaseToolbar + BaseTableSection 组合页面？（Y/N）
- 差异化是否通过 actions 插槽/配置实现，而不是在组件内写死？（Y/N）
- 是否移除行内样式与魔法数？（Y/N）
- BaseTableSection 是否仍使用 :height="numericTableHeight" 且 pager-bar 类名未改？（Y/N）

---

## 权限驱动的动态路由与菜单（可扩展方案）

目标

- 登录后仅注册/展示“有权限”的页面与菜单；刷新后自动恢复。
- 无权限访问自动跳转 /403；未登录跳转登录页。
- 前端仅控可见性与导航，后端继续强制鉴权/权限。

权限来源（双通道，优先 A）

- A. JWT payload：从 token.permissions 解码（零请求，启动快）。
- B. /me 接口：登录后/刷新时获取最新权限与 permsVersion；版本变更时重建路由与菜单。

统一权限判定层

- 提供 hasPerm(...perms) 与 hasAnyPerm(...perms) 工具；页面/组件/按钮统一调用。
- 提供 v-permission 指令用于元素可见性控制。

路由策略（可插拔）

- 白名单静态路由：/login, /403, /404, Layout（最小集合）。
- 动态路由表：各业务模块自维护候选表（如 router/modules/packages/routes.js），声明：
  - path、name、component（懒加载）
  - meta：title、icon、order、hideInMenu、requiresAgent/Client、permissions（AND）、anyPermissions（OR）、featureFlag
- 注入时机：
  - 应用启动：若存在 token → 解析权限 → 过滤候选 → router.addRoute() 注入。
  - 登录成功：保存 token → 重建动态路由 → 跳转首页。
- 移除/重置：resetRouter() 在登出或权限版本变化时移除动态路由，仅保留白名单。

菜单=路由(meta) 的派生

- 从已注入、可访问的路由生成菜单树，尊重 meta.hideInMenu、order、icon、i18nKey。
- 保持菜单与路由单一来源，避免双维护。

守卫与兜底

- 登录态：meta.requiresAgent/Client 且无对应 token → 重定向对应登录页。
- 权限：meta.permissions 不满足 → 重定向 /403。
- 401 拦截：清空对应 token → resetRouter() → 跳登录。
- 提供 /403 与 /404 页面。

配置与扩展点

- Feature Flags：通过 meta.featureFlag 与环境变量/后端开关灰度启用。
- 远端模块开关：后端返回 moduleEnabled 列表，前端合并过滤。
- 权限版本：/me 返回 permsVersion；本地缓存，变化时自动重建。

目录建议（每端独立）

- router/
  - whitelist.js（/login,/403,/404, Layout）
  - dynamic.js（setupDynamicRoutes、resetRouter、buildMenuTree）
  - modules/
    - packages/routes.js
    - inbonds/routes.js
- permissions/
  - index.js（hasPerm、hasAnyPerm、v-permission）
- store/
  - auth.js（token、user、permsVersion）
  - ui.js（菜单、折叠状态）

权限命名与约定

- 与后端一致：如 agent.package.view、client.inbond.view。
- meta.permissions 为 AND；如需 OR，使用 meta.anyPermissions。

最小落地步骤（实施时）

1. 新增 /403 页面与白名单路由。
2. 实现 hasPerm 工具与 v-permission 指令。
3. 各模块新增候选路由表，仅声明不自动注册。
4. 应用启动与登录成功时：解析权限（JWT 或 /me）→ setupDynamicRoutes(perms) → 跳首页。
5. Axios 401：清理 token → resetRouter → 跳对应登录页。
6. 菜单由已注册动态路由派生生成。

收益

- 模块自管声明，核心统一注册，扩展性强；
- 支持灰度/远程开关、权限热更新；
- 前端“可见性/导航”与后端“鉴权/权限”双层保障。

---

## 与当前代码实现的实时约束（需保持同步）

- 组合式 API
  - 新页面/重构页面采用 `<script setup>`；路由/通知/高度计算调用见 `Packages.vue` 实现。

- 表格自适应高度（BaseTableSection）
  - 文件：`frontend-client/src/components/common/BaseTableSection.vue`
  - 必须使用 :height="numericTableHeight"（不要改用 max-height）。
  - 依赖 viewportH 触发重算；pager 容器类名固定为 pager-bar；禁止在模板属性中插入 HTML 注释。
  - numericTableHeight = clamp(base from computedTableHeight/tableMinH) + heightExtra（在视口较小时按阈值衰减）。

- 页面骨架与工具条
  - 统一使用 `BasePageLayout` + `BaseToolbar` 组织页面；筛选在 toolbar 的 filters 插槽，按钮在 actions 插槽或 actions 配置数组。

- 动态路由（Client 模块）
  - 文件：`frontend-client/src/router/dynamic.js`
  - 已注入候选：/inbonds、/inbonds/new、/packages、/airwaybills。
  - 菜单来自已注入路由的 meta（buildMenuTree）。

- 列表页布局约定
  - Inbonds.vue / Packages.vue 复用 InbondListSection → BaseTableSection；保持 pager 在底部并填充空白。
  - 视口缩放时需调用 computeAutoHeights 以更新 tableMinH/computedTableHeight。

- HTTP 与权限
  - Axios 实例：`src/api/http.js`；token 键 client 使用 `token_client`；401 统一跳转登录。
  - 路由守卫：登录态未注入动态路由时先 setupDynamicRoutes，再导航。

---

## 维护指引（如何保持本文与代码同步）

- 当以下文件发生变更时，同步更新本节：
  - `frontend-client/src/components/common/BaseTableSection.vue`（高度算法、类名、prop）
  - `frontend-client/src/router/dynamic.js`（候选路由、权限 meta、菜单策略）
  - `frontend-client/src/views/*`（核心列表页结构/槽位约定）
  - 新增样式与基础部件：`src/styles/**/*`、`src/components/base/**/*`（tokens/主题、BasePageLayout/BaseToolbar 等）
  - 组合式改造：若页面从 Options 迁移到 Composition，需在本文“组合式 API 约定/已迁移”处登记。
- PR 模板：勾选“前端规范同步”，说明是否已更新本文的相关小节。
