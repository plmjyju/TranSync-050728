<template>
  <el-card
    class="section-card enhanced table-section"
    shadow="never"
    :key="paneKey"
    :style="computedStyle"
  >
    <div class="ops-bar" :class="{ empty: !hasOps }">
      <slot name="ops" />
    </div>
    <div class="table-shell">
      <div
        class="table-wrap fancy"
        :class="[{ 'is-scrolled': headerScrolled, 'no-sticky': !headerSticky }]"
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
          v-bind="tableProps"
          @row-dblclick="(...args) => $emit('row-dblclick', ...args)"
          @current-change="onCurrentChange"
          @selection-change="onSelectionChange"
          @sort-change="onSortChange"
        >
          <template #empty>
            <slot name="empty">
              <div class="empty-block big">
                <el-icon
                  style="font-size: 40px; color: #c0c4cc; margin-bottom: 8px"
                  ><DocumentRemove
                /></el-icon>
                <div class="empty-text">{{ emptyText }}</div>
              </div>
            </slot>
          </template>
          <el-table-column
            v-if="selection"
            type="selection"
            :width="selectionWidth"
            :fixed="selectionFixed ? 'left' : false"
          />
          <slot name="columns" />
        </el-table>
      </div>
      <div v-if="showPager" class="pager-bar" :class="'align-' + pagerAlign">
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
import AppPager from "./AppPager.vue";
import themeVars from '../../styles/tableSectionTheme.js';
export default {
  name: "BaseTableSection",
  props: {
    paneKey: { type: [String, Number], default: "" },
    rows: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    page: { type: Number, default: 1 },
    limit: { type: Number, default: 20 },
    total: { type: Number, default: 0 },
    autoHeight: { type: Boolean, default: true },
    sectionMinH: { type: Number, default: 0 },
    tableMinH: { type: Number, default: 0 },
    computedSectionHeight: { type: Number, default: 920 },
    computedTableHeight: { type: Number, default: 920 },
    fillTable: { type: Boolean, default: false },
    sortProp: { type: String, default: "" },
    sortOrder: { type: String, default: "" },
    selection: { type: Boolean, default: true },
    selectionFixed: { type: Boolean, default: true },
    selectionWidth: { type: [Number, String], default: 45 },
    emptyText: { type: String, default: "暂无数据" },
    showPager: { type: Boolean, default: true },
    pagerAlign: { type: String, default: "end" },
    tableProps: { type: Object, default: () => ({}) },
    headerSticky: { type: Boolean, default: true },
    cssVars: { type: Object, default: () => ({}) },
    rowHeight: { type: Number, default: 45 },
    heightExtra: { type: Number, default: 50 } // 新增：额外增高像素
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
    return { headerScrolled: false, currentRow: null, selectedRows: [], viewportH: (typeof window!=='undefined'? window.innerHeight:0) };
  },
  mounted() {
    this.$nextTick(() => this.bindScroll());
    this._vhHandler = () => { this.viewportH = window.innerHeight || 0; };
    window.addEventListener('resize', this._vhHandler, { passive: true });
  },
  beforeUnmount() {
    this.unbindScroll();
    if (this._vhHandler) window.removeEventListener('resize', this._vhHandler);
  },
  computed: {
    numericTableHeight() {
      // 基础高度（父组件已经根据可用高度计算 tableMinH / computedTableHeight）
      const raw = this.autoHeight ? (Number(this.computedTableHeight || this.tableMinH) || 0) : (this.tableMinH || this.computedTableHeight || 600);
      let base = raw <= 0 ? 600 : Math.max(320, Math.min(1500, raw));
      // 视口高度自适应衰减额外高度，避免窗口缩小时分页器被挤出
      let extra = this.heightExtra || 0;
      const vh = this.viewportH || 0; // 使用响应式 viewportH 触发重算
      if (vh > 0) {
        if (vh < 760) extra = 0; else if (vh < 900) { const ratio = (vh - 760) / 140; extra = Math.round(extra * ratio); }
      }
      return base + extra;
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
    computedStyle() {
      const styleObj = this.autoHeight ? { minHeight: this.sectionMinH + 'px' } : {};
      const vars = { ...themeVars, ...(this.cssVars || {}) };
      Object.keys(vars).forEach(k => { styleObj[k] = vars[k]; });
      return styleObj;
    },
    hasOps() { return !!this.$slots.ops; },
  },
  methods: {
    cellStyle() {
      return {
        padding: '0 10px',
        height: this.rowHeight + 'px',
        lineHeight: this.rowHeight + 'px',
        fontSize: '14px'
      };
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
      if (!this.headerSticky) return;
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
.table-section { font-size: var(--ts-font-size); }
.section-card.enhanced {
  flex: 1 1 auto;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ops-bar {
  margin-bottom:16px; /* 由原 12px 调整为 16px 统一 */
  padding: 0 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  min-height:32px; /* 新增：无内容时仍占位 */
}
.ops-bar.empty { min-height:32px; }
.table-shell {
  background: var(--ts-bg-table-shell);
  border:1px solid var(--ts-border-color);
  box-shadow: var(--ts-shell-shadow);
  border-radius: var(--ts-table-radius);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1 1 auto;
  min-height: 0;
  margin: 0 var(--ts-horizontal-gap) 0;
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
  font-size: var(--table-font-size);
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
.table-wrap.fancy.no-sticky :deep(.el-table__header-wrapper) {
  position: static;
  box-shadow: none;
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
  margin: 0 var(--ts-horizontal-gap) var(--ts-bottom-gap);
}
.pager-bar.align-start {
  justify-content: flex-start;
}
.pager-bar.align-center {
  justify-content: center;
}
.pager-bar :deep(.ts-pager) {
  background: transparent;
  width: 100%;
  padding: 6px 16px;
}
.table-wrap.fancy :deep(.el-table__body tr.row-even:hover > td),
.table-wrap.fancy :deep(.el-table__body tr.row-odd:hover > td) {
  background: var(--ts-row-hover-bg)!important;
}
.table-wrap.fancy :deep(.el-table__body tr.row-selected > td) {
  background: var(--ts-row-selected-bg)!important;
}
.table-wrap.fancy :deep(.el-table__body tr.row-current > td) {
  background: var(--ts-row-current-bg)!important;
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
  background: var(--ts-tag-success-bg);
  color: var(--ts-tag-success-color);
}
.table-wrap.fancy :deep(.el-tag--info) {
  background: var(--ts-tag-info-bg);
  color: var(--ts-tag-info-color);
}
.table-wrap.fancy :deep(.el-scrollbar__wrap)::-webkit-scrollbar {
  width: 6px;
  height: 8px;
}
.table-wrap.fancy :deep(.el-scrollbar__wrap)::-webkit-scrollbar-thumb {
  background: var(--ts-scrollbar-thumb);
  border-radius: 4px;
}
.table-wrap.fancy :deep(.el-scrollbar__wrap)::-webkit-scrollbar-thumb:hover {
  background: var(--ts-scrollbar-thumb-hover);
}
.table-wrap.fancy :deep(.el-table__body td) {
  transition: background-color 0.15s ease;
}
.table-wrap.fancy :deep(.el-table__header th) {
  padding: 8px 10px;
  background: var(--ts-header-bg);
  font-size: var(--table-font-size);
}
.empty-block.big {
  padding: 60px 0;
}
.empty-text {
  font-size: 14px;
}
.table-wrap.fancy :deep(.el-table__body td) { padding:0 10px !important; height:45px; }
.table-wrap.fancy :deep(.el-table__body td .cell){ line-height:45px; height:45px; font-size: var(--table-font-size); display:flex; align-items:center; }
.table-wrap.fancy :deep(.el-table__body td .cell .el-button){
  font-size: var(--table-font-size) !important;
  line-height: 20px; /* 保持按钮本身内部行高 */
  padding: 0 4px !important;
  height: 28px; /* 视觉统一 */
  display: inline-flex;
  align-items: center;
}
.table-wrap.fancy :deep(.el-table__body td .cell .el-button + .el-button){ margin-left:4px; }
</style>
