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
          <div class="filter-toolbar">
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
          </div>
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
import '../styles/sectionLayout.css';

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
      baselineTableH: null,
      baselineSectionH: null,
      baselineLimited: false,
      _autoHeightTimer: null,
      // 新增：按视口宽度分桶的基线缓存，避免不同宽度下复用不合适高度
      baselineCache: {}, // { bucketKey: { tableH, sectionH, limited } }
      // 新增：ResizeObserver 实例引用
      _ro: null,
      // 新增：最近一次高度计算时间戳，用于节流
      _lastCalcTS: 0,
      // 新增：进行中的多次重试计数
      _recalcAttempt: 0,
      tableViewHeight: null, // 新增：直接用于表格视图高度（max-height）
    };
  },
  computed: {
    computedTableHeight() {
      // 新：返回用于 max-height 的高度，不再强制 1000 兜底
      if (!this.autoHeight) return undefined;
      if (this.tableViewHeight) return this.tableViewHeight;
      const h = Number(this.tableMinH) || 0;
      if (!h) return undefined;
      return Math.max(260, Math.min(1500, Math.floor(h)));
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
    this.$nextTick(() => {
      this.computeAutoHeights();
      // 调试辅助，全局函数可手动触发并查看当前高度状态
      if (typeof window !== 'undefined') {
        window.__inbondDebug = () => {
          const r = {
            tableMinH: this.tableMinH,
            sectionMinH: this.sectionMinH,
            baselineTableH: this.baselineTableH,
            baselineSectionH: this.baselineSectionH,
            activeStatus: this.activeStatus,
          };
            // eslint-disable-next-line no-console
          console.log('[__inbondDebug]', r);
          this.computeAutoHeights();
          return r;
        };
      }
    });
    window.addEventListener("resize", this.handleResize, { passive: true });
    // 新增：使用 ResizeObserver 监听容器尺寸变化
    const pageWrap = this.$el?.querySelector('.page-wrap') || this.$el;
    if (window.ResizeObserver && pageWrap) {
      let pending = false;
      this._ro = new ResizeObserver(() => {
        if (!this.autoHeight) return;
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          this.computeAutoHeights({ reason: 'resize-observer' });
        });
      });
      this._ro.observe(pageWrap);
    }
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.handleResize);
    if (this._filterTimer) clearTimeout(this._filterTimer);
    if (this._autoHeightTimer) clearTimeout(this._autoHeightTimer);
    if (this._ro) {
      try { this._ro.disconnect(); } catch(e) {}
      this._ro = null;
    }
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
        // 移除立即 computeAutoHeights，等待数据加载后的最终尺寸减少抖动
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
    getViewportBucket() {
      const w = window.innerWidth || 1920;
      if (w < 1280) return 'w<1280';
      if (w < 1600) return '1280-1599';
      if (w < 1920) return '1600-1919';
      return '>=1920';
    },
    storeBaseline(tableH, sectionH, limited) {
      const bucket = this.getViewportBucket();
      this.baselineCache[bucket] = { tableH, sectionH, limited };
      // 兼容旧字段（保持其它逻辑不崩）
      this.baselineTableH = tableH;
      this.baselineSectionH = sectionH;
      this.baselineLimited = limited;
    },
    reuseBaselineIfPossible() {
      if (this.activeStatus === 'all') return false; // 仅非 all 才复用
      const bucket = this.getViewportBucket();
      const bl = this.baselineCache[bucket];
      if (bl && bl.tableH >= 320 && !bl.limited) {
        this.tableMinH = bl.tableH;
        this.sectionMinH = bl.sectionH;
        return true;
      }
      return false;
    },
    // 替换/增强原 computeAutoHeights
    computeAutoHeights(opts = {}) {
      if (!this.autoHeight) return;
      const now = performance.now();
      if (now - this._lastCalcTS < 40 && !opts.force) return;
      this._lastCalcTS = now;
      if (this.reuseBaselineIfPossible()) return;
      const attempt = (opts.attempt ?? 0);
      const MAX_ATTEMPTS = 4;
      const run = () => {
        try {
          const vh = window.innerHeight || document.documentElement.clientHeight || 900;
          const tabsHeader = document.querySelector('.status-tabs .el-tabs__header');
            const headerH = tabsHeader ? tabsHeader.getBoundingClientRect().height : 0;
          // 当前激活 pane 内 filter
          const pane = document.querySelector('.page-wrap .el-tab-pane.is-active');
          if (!pane) return;
          const filterBar = pane.querySelector('.filter-toolbar');
          const filterH = filterBar ? filterBar.getBoundingClientRect().height : 0;
          const opsBar = pane.querySelector('.section-card .ops-bar');
          const opsH = opsBar ? opsBar.getBoundingClientRect().height : 0;
          const pagerEl = pane.querySelector('.pager-bar, .pager');
          const pagerH = pagerEl ? pagerEl.getBoundingClientRect().height : 48;
          const verticalPadding = 16 + 16; // section 上下内边距
          const chromeGap = 8; // 底部余量
          const headerOffset = headerH + filterH;
          let available = vh - headerOffset - chromeGap - verticalPadding - opsH - pagerH;
          // 初步估算
          if (available < 200) available = 200;
          // 小数据行压缩
          if (this.rows && this.rows.length && this.rows.length < 8) {
            const rowApprox = 45 * this.rows.length + 52; // 52 预估表头
            if (rowApprox < available) available = Math.max(260, rowApprox + 4);
          }
          const tableH = Math.max(260, Math.min(1500, available));
          this.tableViewHeight = tableH;
          this.tableMinH = tableH;
          const sectionTotal = tableH + verticalPadding + pagerH + opsH;
          this.sectionMinH = sectionTotal;
          if (this.activeStatus === 'all' && tableH >= 260) {
            this.storeBaseline(tableH, sectionTotal, false);
          }
          if (process.env.NODE_ENV !== 'production') {
            console.log('[autoHeight-v2]', { vh, headerH, filterH, opsH, pagerH, tableH, sectionMinH: this.sectionMinH, attempt });
          }
          if (attempt < MAX_ATTEMPTS - 1) {
            // 再次校正一次（应对首轮布局不稳定）
            const delays = [30, 80, 140];
            setTimeout(() => this.computeAutoHeights({ attempt: attempt + 1, reason: 'retry2' }), delays[attempt]);
          }
        } catch (e) { console.warn('[autoHeight-v2-error]', e); }
      };
      this.$nextTick(() => requestAnimationFrame(run));
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
/* 仅保留本页面相对通用样式的增量部分 */
.ops-bar { margin-bottom:16px; padding:0 16px; }
.section-card { background-color:#f8f9fa; padding:16px 0 16px; --el-card-padding:0; --el-card-border-radius:0; }
.table-wrap { background:#fff; overflow:hidden; margin:0 16px; border-radius:8px 8px 0 0; border:1px solid #f1f1f1; }
.pager { text-align:left; margin:8px 16px 8px; }
.ops-btn { min-width:88px; height:32px; padding:0 16px; }
.ops-btn-secondary { --el-button-bg-color:#fff; padding:0 16px; }
</style>
<style>
/* 全局高度与 flex 布局兜底，确保自适应计算有意义 */
html, body, #app { height:100%; }
.page-wrap, .full-card, .full-card > .el-card__body { height:100%; display:flex; flex-direction:column; }
.status-tabs { flex:1 1 auto; display:flex; flex-direction:column; }
.status-tabs > .el-tabs__content { flex:1 1 auto; display:flex; flex-direction:column; }
.el-tab-pane { flex:1 1 auto; display:flex; flex-direction:column; }
/* 使 sectionCard 内部表格区可以撑满 */
.section-card .table-shell { display:flex; flex-direction:column; flex:1 1 auto; }
.section-card .table-wrap { flex:1 1 auto; display:flex; flex-direction:column; }
.section-card .table-wrap .el-table { flex:1 1 auto; }
</style>
