<template>
  <template v-for="col in normalCols" :key="col.key || col.prop || col.label">
    <el-table-column
      :prop="col.prop"
      :label="col.label"
      :width="col.width"
      :min-width="col.minWidth"
      :fixed="col.fixed"
      :align="col.align || 'left'"
      :sortable="
        col.sortable ? (col.sortable === true ? 'custom' : col.sortable) : false
      "
      show-overflow-tooltip
    >
      <template #default="scope">
        <template v-if="col.type === 'tag'">
          <el-tag
            v-if="tagMeta(col, scope.row).text"
            :type="tagMeta(col, scope.row).type"
            size="small"
            effect="light"
            disable-transitions
          >
            {{ tagMeta(col, scope.row).text }}
          </el-tag>
          <span v-else>—</span>
        </template>
        <template v-else-if="col.formatter">
          <span>{{
            col.formatter(
              scope.row,
              scope.column,
              scope.row[col.prop],
              scope.$index
            )
          }}</span>
        </template>
        <template v-else>
          <span>{{ scope.row[col.prop] ?? "-" }}</span>
        </template>
      </template>
    </el-table-column>
  </template>
</template>

<script>
const STATUS_TAG_MAP = {
  draft: { text: "草稿", type: "info" },
  submitted: { text: "已提交", type: "primary" },
  warehouse_processing: { text: "处理中", type: "warning" },
  checked_in: { text: "已入库", type: "success" },
  exception: { text: "异常", type: "danger" },
};
const CLEARANCE_TAG_MAP = {
  T01: { text: "T01", type: "success" },
  T11: { text: "T11", type: "primary" },
  "T06-T01": { text: "T06-T01", type: "warning" },
  general_trade: { text: "一般贸易", type: "info" },
  bonded_warehouse: { text: "保税仓", type: "info" },
};
export default {
  name: "AutoColumns",
  props: { schema: { type: Array, default: () => [] } },
  computed: {
    normalCols() {
      return (this.schema || []).filter((c) => c.type !== "action");
    },
  },
  methods: {
    tagMeta(col, row) {
      const raw = row?.[col.prop];
      if (raw == null || raw === "") return { text: "", type: "info" };
      if (col.tagMap === "status")
        return STATUS_TAG_MAP[raw] || { text: raw, type: "info" };
      if (col.tagMap === "clearance")
        return CLEARANCE_TAG_MAP[raw] || { text: raw, type: "info" };
      if (typeof col.getTagMeta === "function") return col.getTagMeta(raw, row);
      // 自动猜测
      if (col.prop === "status")
        return STATUS_TAG_MAP[raw] || { text: raw, type: "info" };
      if (col.prop === "clearance_type")
        return CLEARANCE_TAG_MAP[raw] || { text: raw, type: "info" };
      return { text: raw, type: "info" };
    },
  },
};
</script>

<style scoped></style>
