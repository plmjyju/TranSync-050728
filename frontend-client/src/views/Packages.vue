<template>
  <BasePageLayout>
    <template #header>
      <h2 class="ellipsis">包裹列表</h2>
    </template>

    <template #toolbar>
      <BaseToolbar @search="immediateSearch">
        <template #filters>
          <!-- 临时复用 InbondToolbar 作为筛选 UI，后续可抽象为通用 Filters -->
          <InbondToolbar
            :q="q"
            :status="status"
            :showStatus="true"
            :placeholder="'搜索包裹号/备注'"
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
        </template>
        <template #actions>
          <el-button size="small" type="primary" @click="immediateSearch">刷新</el-button>
        </template>
      </BaseToolbar>
    </template>

    <el-tabs v-model="activeStatus" class="status-tabs">
      <el-tab-pane
        v-for="t in tabDefs"
        :key="t.name"
        :label="t.label"
        :name="t.name"
      >
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
            <!-- 包裹页暂不提供“新建/提交”等操作，后续按权限注入 -->
          </template>
          <template #columns>
            <AutoColumns :schema="columnsSchemaByStatus[t.name]" />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="openEditorFor(row)">查看</el-button>
              </template>
            </el-table-column>
          </template>
        </InbondListSection>
      </el-tab-pane>
    </el-tabs>
  </BasePageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElNotification } from 'element-plus';
import http from "../api/http";
import InbondListSection from "../components/inbonds/InbondListSection.vue";
import InbondToolbar from "../components/inbonds/InbondToolbar.vue";
import AutoColumns from "../components/inbonds/AutoColumns.vue";
import BasePageLayout from "../components/base/BasePageLayout.vue";
import BaseToolbar from "../components/base/BaseToolbar.vue";

defineOptions({ name: 'ClientPackages' });

// state
let _filterTimer = null;
let _autoHeightTimer = null;
let _ro = null;
const _lastCalcTS = ref(0);

const page = ref(1);
const limit = ref(20);
const q = ref("");
const status = ref("");
const rows = ref([]);
const total = ref(0);
const loading = ref(false);
const activeStatus = ref("all");
const autoHeight = ref(true);
const sectionMinH = ref(0);
const tableMinH = ref(0);
const sectionPadTop = ref(0);
const sectionPadBottom = ref(0);
const pagerBlockH = ref(0);
const dateField = ref("created_at");
const dateRange = ref([]);
const clearanceDoc = ref("");
const sortProp = ref("");
const sortOrder = ref(""); // ascending / descending
const selectedRows = ref([]);
const forceKey = ref(0);
const baselineTableH = ref(null);
const baselineSectionH = ref(null);
const baselineLimited = ref(false);
const baselineCache = ref({});
const tableViewHeight = ref(null);

// router
const route = useRoute();
const router = useRouter();

// computed
const computedTableHeight = computed(() => {
  if (!autoHeight.value) return undefined;
  if (tableViewHeight.value) return tableViewHeight.value;
  const h = Number(tableMinH.value) || 0;
  if (!h) return undefined;
  return Math.max(260, Math.min(1500, Math.floor(h)));
});

const computedSectionHeight = computed(() => {
  if (!autoHeight.value) return 920;
  const t = Number(tableMinH.value) || 0;
  if (!t) return 920;
  const totalH = t + (sectionPadTop.value || 0) + (sectionPadBottom.value || 0) + (pagerBlockH.value || 0);
  return Math.max(380, Math.floor(totalH));
});

const tabDefs = computed(() => ({
  all: { name: "all", label: "全部", showStatus: true, placeholder: "搜索（全部）" },
  draft: { name: "draft", label: "草稿", showStatus: false, placeholder: "搜索（草稿）" },
  submitted: { name: "submitted", label: "已提交", showStatus: false, placeholder: "搜索（已提交）" },
  exception: { name: "exception", label: "异常", showStatus: false, placeholder: "搜索（异常）" },
}));

function formatDateTime(row, column, value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const columnsSchemaByStatus = computed(() => {
  const statusCol = { prop: "status", label: "状态", width: 120, type: "tag", tagMap: "status" };
  const base = [
    { prop: "package_code", label: "包裹号", width: 180, sortable: true, fixed: "left" },
    { prop: "inbond_id", label: "入库单ID", width: 120 },
    { prop: "mawb", label: "MAWB", width: 140 },
    { prop: "hawb", label: "HAWB", width: 140 },
    statusCol,
    { prop: "created_at", label: "创建时间", width: 180, sortable: true, formatter: formatDateTime },
    { prop: "remark", label: "备注", minWidth: 220 },
  ];
  const clone = () => base.map((c) => ({ ...c }));
  return { all: clone(), draft: clone(), submitted: clone(), exception: clone() };
});

// lifecycle
if (route?.query?.statusTab) activeStatus.value = String(route.query.statusTab);

onMounted(() => {
  nextTick(() => {
    computeAutoHeights();
    if (typeof window !== 'undefined') {
      window.__packagesDebug = () => {
        const r = {
          tableMinH: tableMinH.value,
          sectionMinH: sectionMinH.value,
          baselineTableH: baselineTableH.value,
          baselineSectionH: baselineSectionH.value,
          activeStatus: activeStatus.value,
        };
        // eslint-disable-next-line no-console
        console.log('[__packagesDebug]', r);
        computeAutoHeights();
        return r;
      };
    }
  });
  window.addEventListener('resize', handleResize, { passive: true });
  const rootEl = document.querySelector('.status-tabs');
  if (window.ResizeObserver && rootEl) {
    let pending = false;
    _ro = new ResizeObserver(() => {
      if (!autoHeight.value) return;
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; computeAutoHeights({ reason: 'resize-observer' }); });
    });
    _ro.observe(rootEl);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (_filterTimer) clearTimeout(_filterTimer);
  if (_autoHeightTimer) clearTimeout(_autoHeightTimer);
  if (_ro) { try { _ro.disconnect(); } catch(e) {} _ro = null; }
});

// watchers
watch(() => route.query.statusTab, (nv) => {
  if (nv && nv !== activeStatus.value) activeStatus.value = String(nv);
});

watch(activeStatus, () => { handleActiveStatusChange(); });

// methods
function onFilterChange(key, val) {
  if (key === 'q') q.value = val;
  else if (key === 'status') status.value = val;
  else if (key === 'dateField') dateField.value = val;
  else if (key === 'dateRange') dateRange.value = val;
  else if (key === 'clearanceDoc') clearanceDoc.value = val;
  page.value = 1;
  if (_filterTimer) clearTimeout(_filterTimer);
  _filterTimer = setTimeout(() => { load(); }, 400);
}

function immediateSearch() {
  if (_filterTimer) clearTimeout(_filterTimer);
  page.value = 1;
  load();
}

async function load() {
  loading.value = true;
  try {
    const params = { page: page.value, limit: limit.value, q: q.value, status: status.value };
    if (sortProp.value && sortOrder.value) {
      params.sort_by = sortProp.value;
      params.sort_order = sortOrder.value === 'ascending' ? 'asc' : 'desc';
    }
    if (dateRange.value && dateRange.value.length === 2) {
      params.date_field = dateField.value;
      params.start_date = dateRange.value[0];
      params.end_date = dateRange.value[1];
    } else {
      params.date_field = dateField.value;
    }
    const { data } = await http.get('/api/client/packages', { params });
    const arr = (data && (data.packages || data.data || data.rows)) || [];
    rows.value = arr;
    total.value = data?.pagination?.total || data.total || data.count || 0;
  } catch (e) {
    const msg = e?.response?.data?.message || '加载失败';
    ElNotification.error({ title: '错误', message: msg });
  } finally {
    loading.value = false;
    nextTick(() => computeAutoHeights());
  }
}

function onSortChange({ prop, order }) {
  if (!prop) { sortProp.value = ''; sortOrder.value = ''; load(); return; }
  sortProp.value = prop; sortOrder.value = order; load();
}

function onSelectionChange(r) { selectedRows.value = r || []; }

function handleActiveStatusChange() {
  const map = { all: '', draft: 'draft', submitted: 'submitted', exception: 'exception' };
  status.value = map[activeStatus.value] ?? '';
  page.value = 1; sortProp.value = ''; sortOrder.value = ''; selectedRows.value = []; forceKey.value++;
  if (route.query.statusTab !== activeStatus.value) {
    const qy = { ...route.query, statusTab: activeStatus.value };
    router.replace({ path: route.path, query: qy });
  }
  nextTick(() => { load(); });
}

function getViewportBucket() {
  const w = window.innerWidth || 1920;
  if (w < 1280) return 'w<1280';
  if (w < 1600) return '1280-1599';
  if (w < 1920) return '1600-1919';
  return '>=1920';
}

function storeBaseline(tableH, sectionH, limited) {
  const bucket = getViewportBucket();
  baselineCache.value[bucket] = { tableH, sectionH, limited };
  baselineTableH.value = tableH; baselineSectionH.value = sectionH; baselineLimited.value = limited;
}

function reuseBaselineIfPossible() {
  if (activeStatus.value === 'all') return false;
  const bucket = getViewportBucket();
  const bl = baselineCache.value[bucket];
  if (bl && bl.tableH >= 320 && !bl.limited) { tableMinH.value = bl.tableH; sectionMinH.value = bl.sectionH; return true; }
  return false;
}

function computeAutoHeights(opts = {}) {
  if (!autoHeight.value) return;
  const now = performance.now();
  if (now - _lastCalcTS.value < 40 && !opts.force) return;
  _lastCalcTS.value = now;
  if (reuseBaselineIfPossible()) return;
  const attempt = (opts.attempt ?? 0);
  const MAX_ATTEMPTS = 4;
  const run = () => {
    try {
      const vh = window.innerHeight || document.documentElement.clientHeight || 900;
      const tabsHeader = document.querySelector('.status-tabs .el-tabs__header');
      const headerH = tabsHeader ? tabsHeader.getBoundingClientRect().height : 0;
      const pane = document.querySelector('.el-tab-pane.is-active');
      if (!pane) return;
      const opsBar = pane.querySelector('.section-card .ops-bar');
      const opsH = opsBar ? opsBar.getBoundingClientRect().height : 0;
      const pagerEl = pane.querySelector('.pager-bar, .pager');
      const pagerH = pagerEl ? pagerEl.getBoundingClientRect().height : 48;
      const verticalPadding = 16 + 16;
      const chromeGap = 8;
      const headerOffset = headerH; // filter 在 toolbar，不在 pane 内
      let available = vh - headerOffset - chromeGap - verticalPadding - opsH - pagerH;
      if (available < 200) available = 200;
      if (rows.value && rows.value.length && rows.value.length < 8) {
        const rowApprox = 45 * rows.value.length + 52;
        if (rowApprox < available) available = Math.max(260, rowApprox + 4);
      }
      const tableH = Math.max(260, Math.min(1500, available));
      tableViewHeight.value = tableH; tableMinH.value = tableH;
      const sectionTotal = tableH + verticalPadding + pagerH + opsH;
      sectionMinH.value = sectionTotal;
      if (activeStatus.value === 'all' && tableH >= 260) { storeBaseline(tableH, sectionTotal, false); }
      if (import.meta.env.MODE !== 'production') {
        // eslint-disable-next-line no-console
        console.log('[packages:autoHeight]', { vh, headerH, opsH, pagerH, tableH, sectionMinH: sectionMinH.value, attempt });
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        const delays = [30, 80, 140];
        setTimeout(() => computeAutoHeights({ attempt: attempt + 1, reason: 'retry2' }), delays[attempt]);
      }
    } catch (e) { /* eslint-disable no-console */ console.warn('[packages:autoHeight:error]', e); }
  };
  nextTick(() => requestAnimationFrame(run));
}

function handleResize() { computeAutoHeights(); }

function onRowDblClick(row) { openEditorFor(row); }
function openEditorFor(row) { /* 预留：跳转详情或打开抽屉 */ console.log('[packages:view]', row); }
</script>

<style scoped>
/* 页面不再使用行内魔法数，尽量依赖 Base 组件与全局样式 */
</style>
