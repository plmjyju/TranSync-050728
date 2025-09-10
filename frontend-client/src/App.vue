<template>
  <div class="common-layout">
    <!-- 白名单页不使用通用布局：登录/403/404 -->
    <router-view v-if="['/login', '/403', '/404'].includes($route.path)" />
    <el-container v-else class="layout-root">
      <app-sidebar :collapsed="collapsed" />
      <el-container class="layout-inner">
        <app-header @toggle="collapsed = !collapsed" />
        <el-main class="layout-main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script>
import AppHeader from "./layout/AppHeader.vue";
import AppSidebar from "./layout/AppSidebar.vue";

export default {
  name: "ClientApp",
  components: { AppHeader, AppSidebar },
  data() {
    return { collapsed: false };
  },
};
</script>

<style>
html,
body,
#app {
  height: 100%;
}
body {
  margin: 0;
  background: #f5f7fa;
}
.layout-root {
  height: 100vh;
}
.layout-inner {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.layout-main {
  flex: 1;
  overflow: auto;
  padding: 0 !important;
  margin: 0;
  background: #fff;
}
</style>
