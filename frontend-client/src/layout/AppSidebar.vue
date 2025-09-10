<template>
  <el-aside :width="collapsed ? '64px' : '200px'" class="app-aside">
    <!-- 顶部留出与 Header 一样的高度，放置占位 Logo -->
    <div class="aside-top">
      <div class="logo-wrap">
        <div class="logo-box">LOGO</div>
        <div class="brand-text" v-show="!collapsed">创升OMS</div>
      </div>
    </div>

    <el-menu :default-active="$route.path" :collapse="collapsed" router>
      <template v-for="item in menuItems" :key="item.path">
        <el-sub-menu
          v-if="item.children && item.children.length"
          :index="item.path"
        >
          <template #title>
            <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
            <span>{{ item.title }}</span>
          </template>
          <el-menu-item
            v-for="c in item.children"
            :key="c.path"
            :index="c.path"
            v-permission="c.requiredPerms || []"
          >
            <el-icon v-if="c.icon"><component :is="c.icon" /></el-icon>
            <span>{{ c.title }}</span>
          </el-menu-item>
        </el-sub-menu>
        <el-menu-item
          v-else
          :index="item.path"
          v-permission="item.requiredPerms || []"
        >
          <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </template>
    </el-menu>
  </el-aside>
</template>

<script>
import { buildMenuTree } from "../router/dynamic";
import { hasPerm } from "../permissions";

export default {
  name: "AppSidebar",
  props: { collapsed: { type: Boolean, default: false } },
  computed: {
    menuItems() {
      const exclude = new Set(["/", "/login", "/403", "/404"]);
      const routes = this.$router
        .getRoutes()
        .filter(
          (r) =>
            r.meta &&
            r.meta.requiresClient &&
            !exclude.has(r.path) &&
            !r.path.startsWith("/:")
        );
      const items = buildMenuTree(routes);
      // 附加每项所需权限（来自 meta.permissions）供 v-permission 使用
      return items
        .map((it) => ({
          ...it,
          requiredPerms:
            routes.find((r) => r.path === it.path)?.meta?.permissions || [],
          children: (it.children || []).map((c) => ({
            ...c,
            requiredPerms:
              (routes.find((r) => r.path === it.path)?.children || []).find(
                (cr) =>
                  (it.path.replace(/\/$/, "") + "/" + (cr.path || "")).replace(
                    /\/+/,
                    "/"
                  ) === c.path
              )?.meta?.permissions || [],
          })),
        }))
        .filter(
          (it) => !it.requiredPerms?.length || hasPerm(...it.requiredPerms)
        );
    },
  },
};
</script>

<style scoped>
.app-aside {
  /* 背景改为浅灰，与 Header 区分 */
  background: #f8f8f8;
  color: #303133;
  display: flex;
  flex-direction: column;
  border-right: 0; /* 取消整体右边框，避免作用到顶部区 */
  transition: width 0.2s ease; /* 折叠/展开更顺滑 */
}
.aside-top {
  height: 56px; /* 与 Header 高度一致 */
  display: flex;
  align-items: center;
  padding: 0 12px;
  flex-shrink: 0;
  background: #07183d; /* Sidebar header 深色背景 */
  color: #fff; /* 顶部文字/图标白色 */
  /* 顶部区不需要右边框 */
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06); /* 顶部与菜单区域的细分隔线 */
}
.logo-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo-box {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2); /* 深色顶栏上改为浅色块 */
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  user-select: none;
}
.brand-text {
  font-weight: 600;
  color: #fff; /* 品牌字样在深色顶栏上为白色 */
  letter-spacing: 0.5px;
}

/* 侧边菜单整体留白与右侧分隔线（仅作用于顶部以下） */
:deep(.el-menu) {
  padding: 8px 6px;
  border-right: 1px solid #ebeef5; /* 菜单区域分隔线 */
  background: transparent;
}

/* 菜单项与子菜单标题的公共样式 */
:deep(.el-menu .el-menu-item),
:deep(.el-sub-menu__title) {
  height: 40px;
  line-height: 40px;
  border-radius: 6px;
  margin: 2px 6px;
  transition: background 0.2s ease, color 0.2s ease;
}

/* 图标与文字间距及继承色彩 */
:deep(.el-menu .el-menu-item .el-icon),
:deep(.el-sub-menu__title .el-icon) {
  margin-right: 6px;
  color: inherit;
}

/* 文本溢出省略 */
:deep(.el-menu .el-menu-item span),
:deep(.el-sub-menu__title span) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 悬停态 */
:deep(.el-menu .el-menu-item:hover),
:deep(.el-sub-menu__title:hover) {
  background: #eef3ff;
  color: #07183d;
}

/* 激活态：左侧品牌色指示条 + 加粗 */
:deep(.el-menu .el-menu-item.is-active) {
  background: #eaf2ff;
  color: #07183d;
  font-weight: 600;
  position: relative;
}
:deep(.el-menu .el-menu-item.is-active)::before {
  content: "";
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background: #07183d;
  border-radius: 2px;
}
</style>
