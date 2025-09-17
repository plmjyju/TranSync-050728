<template>
  <div class="page-wrap">
    <el-card class="full-card">
      <!-- 状态 Tabs -->
      <el-tabs v-model="activeStatus" class="status-tabs">
        <el-tab-pane
          v-for="t in tabDefs"
          :key="t.name"
          :label="t.label"
          :name="t.name"
        >
          <InbondToolbar
            :q="q"
            :status="status"
            :showStatus="t.showStatus"
            :placeholder="t.placeholder"
            :date-field="dateField"
            :date-range="dateRange"
            :clearance-doc="clearanceDoc"
            @update:q="onFilterChange('q', $event)"
            @update:status="onFilterChange('status', $event)"
            @update:dateField="onFilterChange('dateField', $event)"
            @update:dateRange="onFilterChange('dateRange', $event || [])"
            @update:clearanceDoc="onFilterChange('clearanceDoc', $event)"
            @enter="immediateSearch"
          />
          <!-- 使用内部 slot 放操作按钮 -->
          <InbondListSection
            :paneKey="t.name"
            :key="activeStatus + '_' + forceKey + '_' + t.name"
            :rows="rows"
            :loading="loading"
            :page="page"
            :limit="limit"
            :total="total"
            :autoHeight="autoHeight"
            :sectionMinH="sectionMinH"
            :tableMinH="tableMinH"
            :computedSectionHeight="computedSectionHeight"
            :computedTableHeight="computedTableHeight"
            :sortProp="sortProp"
            :sortOrder="sortOrder"
            :fillTable="true"
            @row-dblclick="onRowDblClick"
            @update:page="(v) => (page = v)"
            @update:limit="(v) => (limit = v)"
            @reload="load"
            @sort-change="onSortChange"
            @selection-change="onSelectionChange"
            :ref="'section_' + t.name"
          >
            <template #ops>
              <el-button
                v-if="t.name === 'all' || t.name === 'draft'"
                type="primary"
                size="default"
                class="ops-btn"
                @click="goCreateInbond"
                >新建</el-button
              >
              <el-button
                v-if="t.name === 'draft'"
                size="default"
                class="ops-btn ops-btn-secondary"
                :disabled="!selectedRows.length || submittingDrafts"
                @click="handleSubmitSelectedDrafts"
                >提交</el-button
              >
            </template>
            <template #columns>
              <AutoColumns :schema="columnsSchemaByStatus[t.name]" />
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-button
                    type="primary"
                    link
                    size="small"
                    @click="openEditorFor(row)"
                    >编辑</el-button
                  >
                </template>
              </el-table-column>
            </template>
          </InbondListSection>
        </el-tab-pane>
      </el-tabs>
      <!-- 替换为独立编辑抽屉组件 -->
      <InbondEditorDrawer
        v-model:visible="inbondEditorVisible"
        :currentInbondId="currentInbondId"
        @updated="onEditorUpdated"
      />
    </el-card>
  </div>
</template>

<script>
import http from "../api/http";
import InbondListSection from "../components/inbonds/InbondListSection.vue";
import InbondToolbar from "../components/inbonds/InbondToolbar.vue";
import AutoColumns from "../components/inbonds/AutoColumns.vue";
import InbondEditorDrawer from "../components/inbonds/InbondEditorDrawer.vue";

export default {
  name: "ClientInbonds",
  components: {
    InbondListSection,
    InbondToolbar,
    AutoColumns,
    InbondEditorDrawer,
  },
  data() {
    return {
      page: 1,
      limit: 20,
      q: "",
      status: "",
      rows: [],
      total: 0,
      loading: false,
      activeStatus: "all",
      inbondEditorVisible: false,
      currentInbondId: "",
      autoHeight: true,
      sectionMinH: 0,
      tableMinH: 0,
      sectionPadTop: 0,
      sectionPadBottom: 0,
      pagerBlockH: 0,
      dateField: "created_at",
      dateRange: [],
      clearanceDoc: "",
      _filterTimer: null,
      sortProp: "",
      sortOrder: "", // ascending / descending
      selectedRows: [],
      submittingDrafts: false,
      forceKey: 0, // 新增：用于强制重建子组件
    };
  },
  computed: {
    computedTableHeight() {
      // 放宽上限到 1500
      if (!this.autoHeight) return 1000;
      const h = Number(this.tableMinH) || 0;
      if (!h) return 1000; // 初次回退
      return Math.max(360, Math.min(1500, Math.floor(h)));
    },
    computedSectionHeight() {
      // 用表格高度 + 内边距 + 分页器高度，得到卡片的精确总高度
      if (!this.autoHeight) return 920;
      const t = Number(this.tableMinH) || 0;
      if (!t) return 920;
      const total =
        t +
        (this.sectionPadTop || 0) +
        (this.sectionPadBottom || 0) +
        (this.pagerBlockH || 0);
      return Math.max(380, Math.floor(total));
    },
    tabDefs() {
      return [
        {
          name: "all",
          label: "全部",
          showStatus: true,
          placeholder: "搜索备注/编号（全部）",
        },
        {
          name: "draft",
          label: "草稿",
          showStatus: false,
          placeholder: "搜索备注/编号（草稿）",
        },
        {
          name: "submitted",
          label: "已提交",
          showStatus: false,
          placeholder: "搜索备注/编号（已提交）",
        },
        {
          name: "warehouse_processing",
          label: "仓库处理中",
          showStatus: false,
          placeholder: "搜索备注/编号（仓库处理中）",
        },
        {
          name: "checked_in",
          label: "已入库",
          showStatus: false,
          placeholder: "搜索备注/编号（已入库）",
        },
        {
          name: "exception",
          label: "异常",
          showStatus: false,
          placeholder: "搜索备注/编号（异常）",
        },
      ];
    },
    columnsSchemaByStatus() {
      const format = this.formatDateTime;
      const statusCol = {
        prop: "status",
        label: "状态",
        width: 140,
        type: "tag",
        tagMap: "status",
      };
      const clearanceCol = {
        prop: "clearance_type",
        label: "报关类型",
        width: 140,
        type: "tag",
        tagMap: "clearance",
      };
      const base = [
        {
          prop: "inbond_code",
          label: "入库单号",
          width: 180,
          sortable: true,
          fixed: "left",
        },
        { prop: "arrival_method", label: "到仓方式", width: 140 },
        statusCol,
        { prop: "total_packages", label: "总包裹数", width: 120 },
        { prop: "arrived_packages", label: "到仓包裹数", width: 120 },
        clearanceCol,
        {
          prop: "created_at",
          label: "创建时间",
          width: 180,
          sortable: true,
          formatter: format,
        },
        {
          prop: "last_arrival_at",
          label: "最后到达日期",
          width: 200,
          sortable: true,
          formatter: format,
        },
        {
          prop: "last_scan_at",
          label: "最后扫描时间",
          width: 200,
          sortable: true,
          formatter: format,
        },
        { prop: "remark", label: "备注", minWidth: 220 },
      ];
      const clone = () => base.map((c) => ({ ...c })); // 关键：每个tab独立引用避免共享导致diff跳过
      return {
        all: clone(),
        draft: clone(),
        submitted: clone(),
        warehouse_processing: clone(),
        checked_in: clone(),
        exception: clone(),
      };
    },
  },
  created() {
    const tab = this.$route?.query?.statusTab;
    if (tab) this.activeStatus = String(tab);
    this.handleActiveStatusChange();
  },
  mounted() {
    // 初次计算高度并绑定窗口变化事件
    this.$nextTick(() => this.computeAutoHeights());
    window.addEventListener("resize", this.handleResize, { passive: true });
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.handleResize);
  },
  watch: {
    "$route.query.statusTab"(nv) {
      if (nv && nv !== this.activeStatus) this.activeStatus = String(nv);
    },
    activeStatus() {
      this.handleActiveStatusChange();
    },
  },
  methods: {
    onFilterChange(key, val) {
      this[key] = val;
      this.page = 1;
      if (this._filterTimer) clearTimeout(this._filterTimer);
      this._filterTimer = setTimeout(() => {
        this.load();
      }, 400);
    },
    immediateSearch() {
      if (this._filterTimer) clearTimeout(this._filterTimer);
      this.page = 1;
      this.load();
    },
    async load() {
      this.loading = true;
      try {
        const params = {
          page: this.page,
          limit: this.limit,
          q: this.q,
          status: this.status,
        };
        if (this.sortProp && this.sortOrder) {
          params.sort_by = this.sortProp;
          params.sort_order = this.sortOrder === "ascending" ? "asc" : "desc";
        }
        if (this.clearanceDoc)
          params.has_clearance_docs = this.clearanceDoc === "yes" ? 1 : 0;
        if (this.dateRange && this.dateRange.length === 2) {
          params.date_field = this.dateField;
          params.start_date = this.dateRange[0];
          params.end_date = this.dateRange[1];
        } else {
          params.date_field = this.dateField;
        }
        const { data } = await http.get("/api/client/inbonds", { params });
        const arr = (data && (data.inbonds || data.data || data.rows)) || [];
        this.rows = arr;
        this.total = data?.pagination?.total || data.total || data.count || 0;
        console.log("[Inbonds] 数据加载完成", {
          activeStatus: this.activeStatus,
          mappedStatus: this.status,
          page: this.page,
          total: this.total,
          rowsCount: this.rows.length,
          sort: { prop: this.sortProp, order: this.sortOrder },
          selectedCount: this.selectedRows.length,
        });
      } catch (e) {
        const msg = e?.response?.data?.message || "加载失败";
        this.$notify?.error?.({ title: "错误", message: msg });
      } finally {
        this.loading = false;
        this.$nextTick(() => this.computeAutoHeights());
      }
    },
    onSortChange({ prop, order }) {
      if (!prop) {
        this.sortProp = "";
        this.sortOrder = "";
        this.load();
        return;
      }
      this.sortProp = prop;
      this.sortOrder = order; // ascending / descending
      this.load();
    },
    onSelectionChange(rows) {
      this.selectedRows = rows || [];
    },
    async handleSubmitSelectedDrafts() {
      if (!this.selectedRows.length) {
        this.$message.warning("请先选择需要提交的草稿入库单");
        return;
      }
      const invalid = this.selectedRows.filter((r) => r.status !== "draft");
      if (invalid.length) {
        this.$message.error("仅可提交草稿状态入库单，请重新选择");
        return;
      }
      try {
        await this.$confirm(
          `确认提交选中的 ${this.selectedRows.length} 条草稿入库单？`,
          "确认提交",
          { type: "warning" }
        );
      } catch {
        return;
      }
      this.submittingDrafts = true;
      const success = [];
      const failed = [];
      for (const r of this.selectedRows) {
        try {
          await http.post(`/api/client/inbond/${r.id || r.inbond_id}/submit`);
          success.push(r.inbond_code || r.id);
        } catch (e) {
          failed.push({
            code: r.inbond_code || r.id,
            msg: e?.response?.data?.message || e.message,
          });
        }
      }
      this.submittingDrafts = false;
      let msg = `提交完成：成功 ${success.length} 条`;
      if (failed.length) msg += `，失败 ${failed.length} 条`;
      if (failed.length) {
        this.$message.error(msg);
        console.warn("提交失败明细", failed);
      } else {
        this.$message.success(msg);
      }
      this.load();
      // 清空表格选中
      const ref = this.$refs["section_" + this.activeStatus];
      ref &&
        ref.$refs &&
        ref.$refs.tableRef &&
        ref.$refs.tableRef.clearSelection();
      this.selectedRows = [];
    },
    handleActiveStatusChange() {
      const map = {
        all: "",
        draft: "draft",
        submitted: "submitted",
        warehouse_processing: "warehouse_processing",
        checked_in: "checked_in",
        exception: "exception",
      };
      this.status = map[this.activeStatus] ?? "";
      this.page = 1;
      this.sortProp = "";
      this.sortOrder = "";
      this.selectedRows = [];
      this.forceKey++;
      if (this.$route.query.statusTab !== this.activeStatus) {
        // 修复缺失括号
        const q = { ...this.$route.query, statusTab: this.activeStatus };
        this.$router.replace({ path: this.$route.path, query: q });
      }
      console.log("[Inbonds] 切换Tab(开始)", {
        activeStatus: this.activeStatus,
        mappedStatus: this.status,
        page: this.page,
        sort: { prop: this.sortProp, order: this.sortOrder },
        prevRowsCount: this.rows.length,
        selectedCount: this.selectedRows.length,
      });
      this.$nextTick(() => {
        this.load();
        this.computeAutoHeights();
      });
    },
    onStatusChange() {
      // 移除不再使用的tab-click逻辑
    },
    async goCreateInbond() {
      try {
        const { data } = await http.post("/api/client/create-inbond", {
          shipping_type: "air",
          clearance_type: "T01",
          arrival_method: "",
          remark: "",
        });
        const id = data?.inbond?.id || data?.id;
        if (!id) throw new Error("未获取到入库单ID");
        this.currentInbondId = String(id);
        this.inbondEditorVisible = true;
        this.$message.success("已创建草稿入库单");
      } catch (e) {
        const msg = e?.response?.data?.message || e.message || "创建失败";
        this.$message.error(msg);
      }
    },
    onRowDblClick(row) {
      this.openEditorFor(row);
    },
    openEditorFor(row) {
      const id = row?.id || row?.inbond_id || row?.inbondId;
      if (!id) return;
      this.currentInbondId = String(id);
      this.inbondEditorVisible = true;
    },
    onEditorUpdated() {
      this.load();
    },
    computeAutoHeights() {
      if (!this.autoHeight) return;
      this.$nextTick(() => {
        try {
          const pageWrap =
            this.$el.closest(".page-wrap") ||
            this.$el.querySelector(".page-wrap");
          const containerH = pageWrap
            ? pageWrap.getBoundingClientRect().height
            : window.innerHeight || 900;
          const pane = this.$el.querySelector(".el-tab-pane.is-active");
          if (!pane) return;
          const sectionCard = pane.querySelector(".section-card");
          const tableWrap = pane.querySelector(".table-wrap");
          const pagerEl = pane.querySelector(".pager");
          const padTop = 16,
            padBottom = 0,
            bottomGutter = 8;
          const pagerH = pagerEl ? pagerEl.offsetHeight || 0 : 0;
          if (tableWrap) {
            const rect = tableWrap.getBoundingClientRect();
            const topOffset =
              rect.top - (pageWrap ? pageWrap.getBoundingClientRect().top : 0);
            const available = containerH - topOffset - bottomGutter - pagerH;
            // 放宽内层可用高度上限到 1500
            const tableH = Math.max(300, Math.min(1500, Math.floor(available)));
            this.tableMinH = tableH;
            this.sectionPadTop = padTop;
            this.sectionPadBottom = padBottom;
            this.pagerBlockH = pagerH;
            if (sectionCard) {
              const cardRect = sectionCard.getBoundingClientRect();
              const cardTopOffset =
                cardRect.top -
                (pageWrap ? pageWrap.getBoundingClientRect().top : 0);
              const cardAvail = containerH - cardTopOffset - bottomGutter;
              const desired = tableH + padTop + padBottom + pagerH;
              this.sectionMinH = Math.max(340, Math.min(cardAvail, desired));
            } else {
              this.sectionMinH = Math.max(
                340,
                tableH + padTop + padBottom + pagerH
              );
            }
          } else {
            this.tableMinH = this.tableMinH || 600;
            this.sectionMinH = this.sectionMinH || 600;
          }
        } catch (e) {
          this.tableMinH = this.tableMinH || 600;
          this.sectionMinH = this.sectionMinH || 600;
        }
      });
    },
    handleResize() {
      this.computeAutoHeights();
    },
    formatDateTime(row, column, value) {
      if (!value) return "-";
      const d = new Date(value);
      if (isNaN(d.getTime())) return value;
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
        d.getDate()
      )} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    },
  },
};
</script>

<style scoped>
.page-wrap {
  /* 自适应由父级布局控制，不强制 100vh */
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0; /* 允许内部 flex 子项正确收缩 */
  box-sizing: border-box;
  background-color: #f4f6f9;
}
/* 恢复原样式 */
.full-card {
  /* 原有 height:100% 在父元素没有固定高度时无效，改用flex填充 */
  flex: 1 1 auto;

  display: flex;
  flex-direction: column; /* 让内部 tabs 与内容垂直堆叠 */
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  --el-card-padding: 0px;
}

.status-tabs {
  margin-bottom: 0px;
}
.toolbar {
  display: flex;
  align-items: center;
  padding: 16px;
}
.ops-bar {
  margin-bottom: 16px;
  padding-left: 16px;
  padding-right: 16px;
}
.section-card {
  background-color: #f8f9fa;
  padding-bottom: 16px;
  --el-card-padding: 0px;
  --el-card-border-radius: 0px;
  padding-top: 16px;
}
.table-wrap {
  background-color: #fff;
  overflow: hidden;
  margin-left: 16px;
  margin-right: 16px;
  border-radius: 8px 8px 0 0;
  border: 1px solid #f1f1f1;
}
.pager {
  text-align: left;
  margin-top: 8px;
  padding-left: 16px;
  padding-right: 16px;
  margin-bottom: 8px;
}
.status-tabs :deep(.el-tabs__item) {
  font-size: 16px;
  padding: 0 16px;
  height: 48px;
  line-height: 48px;
  font-weight: 0;
}
.status-tabs :deep(.el-tabs__nav-wrap) {
  height: 48px;
}
.status-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.status-tabs :deep(.el-tabs__header .el-tabs__nav .el-tabs__item) {
  padding-left: 16px !important;
  padding-right: 16px !important;
}
.ops-btn {
  min-width: 88px;
  height: 32px;
  padding: 0 16px;
}
.ops-btn:last-child {
  margin-right: 0;
}
/* 次级按钮风格：与示例接近的浅色边框按钮 */
.ops-btn-secondary {
  --el-button-bg-color: #fff;
  padding: 0 16px;
}
</style>
