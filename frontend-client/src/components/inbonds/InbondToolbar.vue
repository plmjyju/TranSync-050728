<template>
  <div class="toolbar">
    <!-- 时间字段 + 范围 -->
    <div class="date-filter-group">
      <el-select
        :model-value="dateField"
        class="date-field-select"
        :teleported="false"
        @update:model-value="(v) => $emit('update:dateField', v)"
      >
        <el-option label="创建时间" value="created_at" />
        <el-option label="最后更改时间" value="updated_at" />
        <el-option label="最后到达时间" value="last_arrival_at" />
      </el-select>
      <el-date-picker
        :model-value="dateRange"
        type="daterange"
        range-separator="→"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        unlink-panels
        :shortcuts="dateShortcuts"
        class="date-range-picker"
        @update:model-value="(v) => $emit('update:dateRange', v)"
      />
    </div>
    <!-- 关键词 -->
    <el-input
      :model-value="q"
      :placeholder="placeholder"
      clearable
      @keyup.enter.native="$emit('enter')"
      @update:model-value="(v) => $emit('update:q', v)"
      style="width: 220px; margin-right: 8px"
    />
    <!-- 有无清关资料 -->
    <el-select
      :model-value="clearanceDoc"
      placeholder="清关资料"
      clearable
      style="width: 140px; margin-right: 8px"
      @update:model-value="(v) => $emit('update:clearanceDoc', v)"
    >
      <el-option label="有资料" value="yes" />
      <el-option label="无资料" value="no" />
    </el-select>
    <!-- 状态 -->
    <el-select
      v-if="showStatus"
      :model-value="status"
      placeholder="状态"
      clearable
      style="width: 160px; margin-right: 8px"
      @update:model-value="(v) => $emit('update:status', v)"
    >
      <el-option label="草稿" value="draft" />
      <el-option label="已提交" value="submitted" />
      <el-option label="仓库处理中" value="warehouse_processing" />
      <el-option label="已入库" value="checked_in" />
      <el-option label="异常" value="exception" />
    </el-select>
    <!-- 自动筛选，无需按钮 -->
  </div>
</template>

<script>
export default {
  name: "InbondToolbar",
  props: {
    q: { type: String, default: "" },
    status: { type: String, default: "" },
    showStatus: { type: Boolean, default: false },
    placeholder: { type: String, default: "搜索备注/编号" },
    dateField: { type: String, default: "created_at" },
    dateRange: { type: Array, default: () => [] }, // [start, end]
    clearanceDoc: { type: String, default: "" }, // yes | no | ''(全部)
  },
  emits: [
    "update:q",
    "update:status",
    "update:dateField",
    "update:dateRange",
    "enter",
    "update:clearanceDoc",
  ],
  computed: {
    dateShortcuts() {
      const fmt = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      const today = new Date();
      const oneWeekAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000);
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      return [
        { text: "最近7天", value: [fmt(oneWeekAgo), fmt(today)] },
        { text: "最近30天", value: [fmt(oneMonthAgo), fmt(today)] },
      ];
    },
  },
};
</script>

<style scoped>
.date-filter-group {
  display: flex;
  align-items: center;
  margin-right: 8px;
}
.date-field-select {
  width: 110px;
  margin-right: 4px;
}
.date-range-picker {
  width: 300px;
  margin-right: 8px;
}
/***** 复用父级已调好的 toolbar 外观（父级已定义 .toolbar 的样式） *****/
</style>
