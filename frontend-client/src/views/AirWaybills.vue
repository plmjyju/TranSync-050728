<template>
  <div class="page-wrap">
    <el-card class="full-card">
      <el-tabs v-model="activeTab" class="status-tabs">
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
              :showStatus="false"
              :placeholder="t.placeholder"
              :date-field="dateField"
              :date-range="dateRange"
              @update:q="onFilterChange('q', $event)"
              @update:dateField="onFilterChange('dateField', $event)"
              @update:dateRange="onFilterChange('dateRange', $event || [])"
              @enter="immediateSearch"
            />
          </div>
          <InbondListSection
            :paneKey="t.name"
            :key="activeTab + '_' + forceKey + '_' + t.name"
            :rows="rows"
            :loading="loading"
            :page="page"
            :limit="limit"
            :total="total"
            :autoHeight="true"
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
                type="primary"
                size="default"
                class="ops-btn"
                @click="goCreateAwb"
              >新建</el-button>
            </template>
            <template #columns>
              <el-table-column prop="mawb" label="主单(MAWB)" width="180" sortable />
              <el-table-column prop="hawb" label="分单(HAWB)" width="200" sortable />
              <el-table-column prop="package_count" label="包裹数" width="100" />
              <el-table-column prop="status" label="状态" width="140" />
              <el-table-column prop="created_at" label="创建时间" width="180" :formatter="formatDateTime" sortable />
              <el-table-column prop="last_scan_at" label="最后扫描时间" width="180" :formatter="formatDateTime" />
              <el-table-column prop="remark" label="备注" min-width="220" />
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" link size="small" @click="openEditorFor(row)">编辑</el-button>
                </template>
              </el-table-column>
            </template>
          </InbondListSection>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script>
import http from "../api/http";
import InbondListSection from "../components/inbonds/InbondListSection.vue";
import InbondToolbar from "../components/inbonds/InbondToolbar.vue";
import '../styles/sectionLayout.css';

export default {
  name: 'ClientAirWaybills',
  components: { InbondListSection, InbondToolbar },
  data() {
    return {
      page: 1,
      limit: 20,
      q: '',
      status: '',
      rows: [],
      total: 0,
      loading: false,
      activeTab: 'all',
      autoHeight: true,
      sectionMinH: 0,
      tableMinH: 0,
      dateField: 'created_at',
      dateRange: [],
      sortProp: '',
      sortOrder: '',
      forceKey: 0,
      tableViewHeight: null,
      baselineCache: {},
      _lastCalcTS: 0,
    };
  },
  computed: {
    tabDefs() {
      return [
        { name: 'all', label: '全部', placeholder: '搜索 主单 / 分单 / 备注' },
        { name: 'recent', label: '近期', placeholder: '搜索近期航空单' },
      ];
    },
    computedTableHeight() {
      if (!this.autoHeight) return undefined;
      if (this.tableViewHeight) return this.tableViewHeight;
      const h = Number(this.tableMinH) || 0;
      if (!h) return undefined;
      return Math.max(260, Math.min(1500, Math.floor(h)));
    },
    computedSectionHeight() {
      if (!this.autoHeight) return 920;
      const t = Number(this.tableMinH) || 0;
      if (!t) return 920;
      return t + 120;
    }
  },
  created() {
    this.handleTabChange();
  },
  mounted() {
    this.$nextTick(() => this.computeAutoHeights());
    window.addEventListener('resize', this.handleResize, { passive: true });
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize);
  },
  watch: {
    activeTab() { this.handleTabChange(); }
  },
  methods: {
    handleTabChange() {
      this.page = 1;
      this.sortProp = ''; this.sortOrder='';
      this.forceKey++;
      this.load();
    },
    onFilterChange(key, val) {
      this[key] = val; this.page = 1; this.load();
    },
    immediateSearch() { this.page = 1; this.load(); },
    async load() {
      this.loading = true;
      try {
        // 占位接口：复用 packages 列表（后端未来提供 /api/client/airwaybills）
        const params = { page: this.page, limit: this.limit, q: this.q };
        if (this.sortProp && this.sortOrder) {
          params.sort_by = this.sortProp; params.sort_order = this.sortOrder==='ascending'?'asc':'desc';
        }
        const { data } = await http.get('/api/client/packages', { params });
        const arr = (data && (data.packages || data.data || data.rows)) || [];
        // 映射为航空单聚合：简单按 (mawb, hawb) 分组
        const map = new Map();
        arr.forEach(p => {
          const key = (p.mawb||'') + '|' + (p.hawb||'');
            if (!map.has(key)) {
              map.set(key, { mawb:p.mawb, hawb:p.hawb, package_count:0, status:p.status, created_at:p.created_at, last_scan_at:p.last_scan_at, remark:p.remark });
            }
            const rec = map.get(key); rec.package_count++; // 可扩展聚合逻辑
        });
        this.rows = Array.from(map.values());
        this.total = this.rows.length; // 简化：前端聚合后总数
      } catch(e) {
        const msg = e?.response?.data?.message || '加载失败';
        this.$notify?.error?.({ title: '错误', message: msg });
      } finally {
        this.loading = false;
        this.$nextTick(()=> this.computeAutoHeights());
      }
    },
    computeAutoHeights(opts={}) {
      if (!this.autoHeight) return;
      const now = performance.now();
      if (now - this._lastCalcTS < 40 && !opts.force) return;
      this._lastCalcTS = now;
      const run = () => {
        try {
          const vh = window.innerHeight || 900;
          const tabsHeader = document.querySelector('.status-tabs .el-tabs__header');
          const headerH = tabsHeader? tabsHeader.getBoundingClientRect().height:0;
          const pane = document.querySelector('.page-wrap .el-tab-pane.is-active');
          if (!pane) return;
          const filterBar = pane.querySelector('.filter-toolbar');
          const filterH = filterBar? filterBar.getBoundingClientRect().height:0;
          const pagerEl = pane.querySelector('.pager-bar, .pager');
          const pagerH = pagerEl? pagerEl.getBoundingClientRect().height:48;
          const verticalPadding = 32; const chromeGap=8; const opsH=48; // 估值
          let available = vh - (headerH+filterH) - chromeGap - verticalPadding - opsH - pagerH;
          if (available < 200) available = 200;
          if (this.rows && this.rows.length && this.rows.length < 8) {
            const rowApprox = 45 * this.rows.length + 52;
            if (rowApprox < available) available = Math.max(260, rowApprox + 4);
          }
          const tableH = Math.max(260, Math.min(1500, available));
          this.tableViewHeight = tableH; this.tableMinH = tableH; this.sectionMinH = tableH + verticalPadding + pagerH + opsH;
        } catch(e) { console.warn('[airwaybills-autoHeight-error]', e); }
      };
      this.$nextTick(()=> requestAnimationFrame(run));
    },
    handleResize() { this.computeAutoHeights(); },
    onSortChange({ prop, order }) { this.sortProp = prop; this.sortOrder = order; this.load(); },
    onSelectionChange() {},
    onRowDblClick(row) { this.openEditorFor(row); },
    openEditorFor(row) { /* 预留：打开编辑抽屉 */ console.log('open', row); },
    goCreateAwb() { this.$message.info('暂未实现创建航空单接口'); },
    formatDateTime(row, column, value) {
      if (!value) return '-';
      const d = new Date(value); if (isNaN(d.getTime())) return value;
      const pad=n=> String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
  }
};
</script>

<style scoped>
.ops-btn { min-width:88px; height:32px; padding:0 16px; }
</style>
<style>
html, body, #app { height:100%; }
.page-wrap, .full-card, .full-card > .el-card__body { height:100%; display:flex; flex-direction:column; }
.status-tabs { flex:1 1 auto; display:flex; flex-direction:column; }
.status-tabs > .el-tabs__content { flex:1 1 auto; display:flex; flex-direction:column; }
.el-tab-pane { flex:1 1 auto; display:flex; flex-direction:column; }
.section-card .table-shell { display:flex; flex-direction:column; flex:1 1 auto; }
.section-card .table-wrap { flex:1 1 auto; display:flex; flex-direction:column; }
.section-card .table-wrap .el-table { flex:1 1 auto; }
</style>
