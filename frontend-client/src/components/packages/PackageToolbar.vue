<template>
  <div class="toolbar">
    <el-input
      :model-value="q"
      :placeholder="placeholder"
      clearable
      @keyup.enter.native="$emit('enter')"
      @update:model-value="v => $emit('update:q', v)"
      style="width:220px; margin-right:8px;"
    />
    <el-input
      :model-value="inbondId"
      placeholder="入库单ID"
      clearable
      @keyup.enter.native="$emit('update:inbondId', inbondId)"
      @update:model-value="v => $emit('update:inbondId', v)"
      style="width:160px; margin-right:8px;"
    />
    <el-select
      :model-value="statusExtra"
      placeholder="内部状态过滤"
      clearable
      style="width:160px; margin-right:8px;"
      @update:model-value="v => $emit('update:statusExtra', v)"
    >
      <el-option label="prepared" value="prepared" />
      <el-option label="received" value="received" />
    </el-select>
    <!-- 无需查询按钮：即时筛选 / 回车触发 -->
  </div>
</template>

<script>
export default {
  name: 'PackageToolbar',
  props: {
    q: { type: String, default: '' },
    inbondId: { type: String, default: '' },
    statusExtra: { type: String, default: '' },
    placeholder: { type: String, default: '搜索包裹码/运单' }
  },
  emits: ['update:q','update:inbondId','update:statusExtra','enter']
};
</script>

<style scoped>

/* 复用全局 .toolbar 样式，无额外本地样式 */
</style>
