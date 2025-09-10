<template>
  <el-header height="64px" class="app-header">
    <div class="left">
      <!-- 移除 is-link 按钮 -->
      <el-tabs
        v-model="editableTabsValue"
        type="card"
        closable
        class="header-tabs"
        @tab-remove="handleTabRemove"
      >
        <el-tab-pane
          v-for="t in editableTabs"
          :key="t.name"
          :label="t.title"
          :name="t.name"
        />
      </el-tabs>
    </div>
    <div class="right">
      <el-button
        type="primary"
        size="small"
        v-permission="['client.inbond.create']"
        @click="createInbond"
        >新建入库单</el-button
      >
      <el-dropdown>
        <span class="el-dropdown-link">
          <el-avatar size="small">U</el-avatar>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item disabled>关于</el-dropdown-item>
            <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </el-header>
</template>

<script>
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "../store/auth";
import router from "../router";

export default {
  name: "AppHeader",
  emits: ["toggle"],
  setup() {
    const store = useAuthStore();
    const route = useRoute();

    const logout = () => {
      store.logout();
      router.replace("/login");
    };
    const createInbond = () => {
      router.push({ path: "/inbonds", query: { new: "1" } });
    };

    const editableTabs = ref([]);
    const editableTabsValue = ref(route.path);

    const pushTabIfAbsent = (r) => {
      const path = r.path;
      if (!editableTabs.value.some((t) => t.name === path)) {
        editableTabs.value.push({
          name: path,
          title: r.meta?.title || r.name || path,
        });
      }
    };

    watch(
      () => route.path,
      () => {
        editableTabsValue.value = route.path;
        pushTabIfAbsent(route);
      },
      { immediate: true }
    );

    watch(editableTabsValue, (val) => {
      if (val && val !== route.path) router.push(val);
    });

    // 仅处理关闭标签
    const handleTabRemove = (targetName) => {
      const tabs = editableTabs.value;
      let activeName = editableTabsValue.value;
      if (activeName === targetName) {
        const idx = tabs.findIndex((t) => t.name === targetName);
        const next = tabs[idx + 1] || tabs[idx - 1];
        if (next) activeName = next.name;
      }
      editableTabs.value = tabs.filter((t) => t.name !== targetName);
      if (activeName && activeName !== targetName) router.push(activeName);
    };

    return {
      logout,
      createInbond,
      editableTabs,
      editableTabsValue,
      handleTabRemove,
    };
  },
};
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 10;
  background: #07183d; /* 深色 */
  color: #fff;
  border-bottom: 0;
  border-right: 0;
  padding: 0 0px; /* 与 Sidebar 顶部一致，内边距对齐 */
}
.left {
  display: flex;
  align-items: center;
  gap: 0; /* 去掉多余间距，Tabs 紧贴 Header 起始位置 */
  overflow: hidden;
}
.right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-tabs {
  margin-left: 0; /* 取消左侧外边距，使标签起点与 Header 对齐 */
}
/***** 提高 Header/Tabs 高度 *****/
/* 固定每个 Tab 宽度为 160px，文本居中；去掉加号，仅右侧分隔线（未选中） */
:deep(.header-tabs.el-tabs--card > .el-tabs__header) {
  background: transparent;
  border: 0; /* 去边框 */
  margin: 0; /* 去掉默认 margin */
  height: 64px; /* Header 更高 */
  padding-top: 10px; /* 顶部空隙略增 */
  padding-left: 0; /* 移除内部左侧留白 */
  box-sizing: border-box;
}
:deep(.header-tabs.el-tabs--card .el-tabs__nav),
:deep(.header-tabs.el-tabs--card .el-tabs__nav-scroll) {
  height: 54px; /* 64 - 10 顶部空隙 */
}
:deep(.header-tabs.el-tabs--card .el-tabs__item) {
  height: 54px; /* 同步标签高度 */
  line-height: 54px;
  width: 160px;
  max-width: 160px;
  display: flex;
  align-items: center;
  justify-content: space-between !important; /* 覆盖先前的居中 */
  padding: 0 10px; /* 左右留白 */
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
}
:deep(.header-tabs.el-tabs--card .el-tabs__item > span) {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.el-tabs--card > .el-tabs__header .el-tabs__nav) {
  border: 0;
}
:deep(.header-tabs.el-tabs--card .el-tabs__item:not(.is-active)) {
  border-right: 1px solid rgba(255, 255, 255, 0.2); /* 未选中仅右侧分隔线 */
}
:deep(.header-tabs.el-tabs--card .el-tabs__item.is-active) {
  background: #fff;
  color: #07183d;
  border: 0;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px; /* 左上右上角圆角 */
}
:deep(.header-tabs.el-tabs--card .el-tabs__item:hover:not(.is-active)) {
  background: rgba(255, 255, 255, 0.06);
}
:deep(.header-tabs .el-tabs__nav-wrap::after) {
  background-color: transparent; /* 去底线 */
}
/* 关闭按钮取消绝对定位，随 Flex 布局靠右 */
:deep(.header-tabs.el-tabs--card .el-tabs__item .el-icon-close),
:deep(.header-tabs.el-tabs--card .el-tabs__item .is-icon-close) {
  position: static;
  right: auto;
  margin-left: 8px;
}
:deep(.header-tabs.el-tabs--card .el-tabs__item.is-active .el-icon-close),
:deep(.header-tabs.el-tabs--card .el-tabs__item.is-active .is-icon-close) {
  color: #07183d;
}
:deep(.app-header .el-button.is-link),
:deep(.app-header .el-icon) {
  color: #fff;
}
</style>
