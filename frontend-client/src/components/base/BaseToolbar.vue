<template>
  <div class="ts-toolbar" :style="{ gap: gapVar }">
    <div class="ts-toolbar__filters">
      <slot name="filters" />
    </div>
    <div class="ts-toolbar__spacer" />
    <div class="ts-toolbar__actions">
      <slot name="actions">
        <el-button
          v-for="(act, idx) in actions"
          :key="idx"
          :type="act.type || 'primary'"
          :icon="act.icon"
          v-permission="act.perm"
          :loading="loading && act.loading"
          size="small"
          @click="() => act.handler && act.handler()"
        >{{ act.label }}</el-button>
      </slot>
    </div>
  </div>
</template>
<script>
export default {
  name: 'BaseToolbar',
  props: {
    gap: { type: [String, Number], default: 'var(--space-3, 12px)' },
    align: { type: String, default: 'between' },
    loading: { type: Boolean, default: false },
    actions: { type: Array, default: () => [] }
  },
  computed: {
    gapVar(){ return typeof this.gap === 'number' ? `${this.gap}px` : this.gap; }
  },
  emits: ['search','reset']
};
</script>
<style scoped>
.ts-toolbar{ display:flex; align-items:center; padding: 8px 0; }
.ts-toolbar__filters{ display:flex; flex-wrap:wrap; gap: var(--space-2, 8px); }
.ts-toolbar__spacer{ flex:1; }
.ts-toolbar__actions{ display:flex; gap: var(--space-2, 8px); }
</style>
