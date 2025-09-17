<template>
  <el-card
    class="section-card enhanced"
    shadow="never"
    :key="paneKey"
    :style="autoHeight ? { minHeight: sectionMinH + 'px' } : null"
  >
    <div class="ops-bar">
      <slot name="ops"></slot>
      <!-- 移除密度切换 -->
    </div>

    <!-- 统一外壳：表格 + 分页背景/边框一致 -->
    <div class="table-shell">
      <div
        class="table-wrap fancy"
        :class="[{ 'is-scrolled': headerScrolled }]"
      >
        <el-table
          ref="tableRef"
          :data="rows"
          :height="numericTableHeight"
          v-loading="loading"
          stripe
          highlight-current-row
          :header-cell-style="headerStyle"
          :cell-style="cellStyle"
          :row-class-name="rowClassName"
          :default-sort="defaultSort"
          @row-dblclick="(...args) => $emit('row-dblclick', ...args)"
          @current-change="onCurrentChange"
          @selection-change="onSelectionChange"
          @sort-change="onSortChange"
        >
          <template #empty>
            <div class="empty-block big">
              <el-icon
                style="font-size: 40px; color: #c0c4cc; margin-bottom: 8px"
                ><DocumentRemove
              /></el-icon>
              <div class="empty-text">暂无数据</div>
            </div>
          </template>
          <el-table-column type="selection" width="45" fixed="left" />
          <slot name="columns"></slot>
        </el-table>
      </div>
      <div class="pager-bar">
        <AppPager
          :current-page="page"
          :page-size="limit"
          :total="total"
          @size-change="
            (s) => {
              $emit('update:limit', s);
              $emit('reload');
            }
          "
          @current-change="
            (p) => {
              $emit('update:page', p);
              $emit('reload');
            }
          "
        />
      </div>
    </div>
  </el-card>
</template>

<script>
import { DocumentRemove } from "@element-plus/icons-vue";
import AppPager from "../common/AppPager.vue";
export default {
  name: "InbondListSection",
  props: {
    paneKey: { type: String, required: true },
    rows: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    page: { type: Number, required: true },
    limit: { type: Number, required: true },
    total: { type: Number, required: true },
    autoHeight: { type: Boolean, default: true },
    sectionMinH: { type: Number, default: 0 },
    tableMinH: { type: Number, default: 0 },
    computedSectionHeight: { type: Number, default: 920 },
    computedTableHeight: { type: Number, default: 920 },
    fillTable: { type: Boolean, default: false },
    sortProp: { type: String, default: "" },
    sortOrder: { type: String, default: "" },
  },
  emits: [
    "reload",
    "row-dblclick",
    "update:page",
    "update:limit",
    "selection-change",
    "sort-change",
  ],
  data() {
    return {
      headerScrolled: false,
      currentRow: null,
      selectedRows: [],
    };
  },
  computed: {
    numericTableHeight() {
      return Number(this.computedTableHeight) || 600;
    },
    headerStyle() {
      return {
        background: "#fafafa",
        fontWeight: 600,
        color: "#303133",
        borderBottom: "1px solid #e5e7eb",
        fontSize: "14px",
      };
    },
    defaultSort() {
      if (this.sortProp && this.sortOrder)
        return { prop: this.sortProp, order: this.sortOrder };
      return {};
    },
  },
  mounted() {
    this.$nextTick(() => {
      this.bindScroll();
    });
  },
  beforeUnmount() {
    this.unbindScroll();
  },
  methods: {
    cellStyle() {
      return { padding: "8px 10px", fontSize: "14px" };
    },
    rowClassName({ row, rowIndex }) {
      const cls = [];
      cls.push(rowIndex % 2 === 0 ? "row-even" : "row-odd");
      if (this.selectedRows.includes(row)) cls.push("row-selected");
      if (this.currentRow === row) cls.push("row-current");
      return cls.join(" ");
    },
    onCurrentChange(row) {
      this.currentRow = row;
    },
    onSelectionChange(rows) {
      this.selectedRows = rows;
      this.$emit("selection-change", rows);
    },
    bindScroll() {
      const wrap = this.$el.querySelector(".table-wrap .el-scrollbar__wrap");
      if (!wrap) return;
      this._scrollEl = wrap;
      wrap.addEventListener("scroll", this.handleBodyScroll, { passive: true });
    },
    unbindScroll() {
      if (this._scrollEl)
        this._scrollEl.removeEventListener("scroll", this.handleBodyScroll);
    },
    handleBodyScroll(e) {
      this.headerScrolled = e.target.scrollTop > 2;
    },
    onSortChange({ prop, order }) {
      this.$emit("sort-change", { prop, order });
    },
  },
  components: { DocumentRemove, AppPager },
};
</script>

<style scoped>
.section-card.enhanced {
  flex: 1 1 auto;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ops-bar {
  margin-bottom: 12px;
  padding: 0 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
/* 已移除密度相关样式 */
.table-shell {
  margin: 0 16px 0;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  flex: 1 1 auto;
  min-height: 0;
}
.table-wrap.fancy {
  margin: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.table-wrap.fancy :deep(.el-table) {
  --el-table-border-color: #f0f0f0;
  font-size: 14px; /* 统一 14px */
}
.table-wrap.fancy :deep(.el-table__inner-wrapper) {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.table-wrap.fancy :deep(.el-table__header-wrapper) {
  flex: 0 0 auto;
}
.table-wrap.fancy :deep(.el-table__body-wrapper) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.table-wrap.fancy :deep(.el-table__inner-wrapper::before) {
  background: transparent;
}
.table-wrap.fancy :deep(.el-table__header-wrapper) {
  position: sticky;
  top: 0;
  z-index: 2;
  transition: box-shadow 0.25s;
}
.table-wrap.fancy.is-scrolled :deep(.el-table__header-wrapper) {
  box-shadow: 0 2px 4px -2px rgba(0, 0, 0, 0.12);
}
.pager-bar {
  background: #fff;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
}
.pager-bar :deep(.ts-pager) {
  background: transparent;
  width: 100%;
  padding: 6px 16px;
}
.table-wrap.fancy :deep(.el-table__body tr.row-even:hover > td),
.table-wrap.fancy :deep(.el-table__body tr.row-odd:hover > td) {
  background: #f5faff !important;
}
.table-wrap.fancy :deep(.el-table__body tr.row-selected > td) {
  background: #e8f4ff !important;
}
.table-wrap.fancy :deep(.el-table__body tr.row-current > td) {
  background: #edf6ff !important;
}
.table-wrap.fancy :deep(.el-table__body tr.row-selected td:first-child),
.table-wrap.fancy :deep(.el-table__body tr.row-current td:first-child) {
  position: relative;
}
.table-wrap.fancy :deep(.el-table__body tr.row-selected td:first-child:before),
.table-wrap.fancy :deep(.el-table__body tr.row-current td:first-child:before) {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #409eff;
}
.table-wrap.fancy :deep(.el-table__body td .cell),
.table-wrap.fancy :deep(.el-table__header th .cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.table-wrap.fancy :deep(.el-tag) {
  border: none;
  font-size: 12px;
  padding: 0 8px;
  line-height: 20px;
  height: 20px;
  border-radius: 10px;
}
.table-wrap.fancy :deep(.el-tag--success) {
  background: #e6f9ed;
  color: #16a34a;
}
.table-wrap.fancy :deep(.el-tag--info) {
  background: #eef2f6;
  color: #475569;
}
.table-wrap.fancy :deep(.el-scrollbar__wrap)::-webkit-scrollbar {
  width: 6px;
  height: 8px;
}
.table-wrap.fancy :deep(.el-scrollbar__wrap)::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 4px;
}
.table-wrap.fancy :deep(.el-scrollbar__wrap)::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.35);
}
.table-wrap.fancy :deep(.el-table__body td) {
  transition: background-color 0.15s ease;
}
.table-wrap.fancy :deep(.el-table__header th) {
  padding: 8px 10px;
  background: #fafafa;
}
.empty-block.big {
  padding: 60px 0;
}
.empty-text {
  font-size: 14px;
}
</style>
