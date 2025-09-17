<template>
  <div
    :class="[
      'app-pager',
      'ts-pager',
      alignClass,
      wrapperClass,
      { 'full-width': fullWidth },
    ]"
  >
    <el-pagination
      v-bind="$attrs"
      :layout="layout"
      :page-sizes="pageSizes"
      @size-change="onSizeChange"
      @current-change="onCurrentChange"
    >
      <template #prev>
        <slot name="prev">
          <i class="iconfont lx_arrow_down_rev rotate-90"></i>
        </slot>
      </template>
      <template #next>
        <slot name="next">
          <i class="iconfont lx_arrow_down_rev rotate-270"></i>
        </slot>
      </template>
    </el-pagination>
  </div>
</template>

<script>
import "../../styles/pagination.css";
export default {
  name: "AppPager",
  inheritAttrs: false,
  props: {
    layout: {
      type: String,
      default: "total, prev, pager, next, sizes, jumper",
    },
    pageSizes: {
      type: Array,
      default: () => [20, 50, 100, 200],
    },
    wrapperClass: { type: [String, Array, Object], default: () => [] },
    align: { type: String, default: "right" }, // left | center | right
    fullWidth: { type: Boolean, default: false },
  },
  emits: ["size-change", "current-change"],
  computed: {
    alignClass() {
      const map = {
        left: "ts-pager-align-left",
        center: "ts-pager-align-center",
        right: "ts-pager-align-right",
      };
      return map[this.align] || map.right;
    },
  },
  methods: {
    onSizeChange(v) {
      this.$emit("size-change", v);
    },
    onCurrentChange(v) {
      this.$emit("current-change", v);
    },
  },
};
</script>

<style scoped>
/* 仅保留容器微调，可选铺满 */
.app-pager {
  width: auto;
}
.app-pager.full-width {
  width: 100%;
}
</style>
