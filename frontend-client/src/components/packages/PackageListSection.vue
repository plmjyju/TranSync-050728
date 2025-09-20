<template>
  <BaseTableSection
    v-bind="baseProps"
    @reload="$emit('reload')"
    @row-dblclick="(...a) => $emit('row-dblclick', ...a)"
    @update:page="v => $emit('update:page', v)"
    @update:limit="v => $emit('update:limit', v)"
    @selection-change="r => $emit('selection-change', r)"
    @sort-change="p => $emit('sort-change', p)"
  >
    <template #ops><slot name="ops" /></template>
    <template #columns><slot name="columns" /></template>
    <template #empty><slot name="empty" /></template>
  </BaseTableSection>
</template>
<script>
import BaseTableSection from '../common/BaseTableSection.vue';
export default {
  name: 'PackageListSection',
  components: { BaseTableSection },
  inheritAttrs: false,
  props: {
    paneKey: { type: String, required: true },
    rows: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    page: { type: Number, required: true },
    limit: { type: Number, required: true },
    total: { type: Number, required: true },
    autoHeight: { type: Boolean, default: true },
    sectionMinH: { type: Number, default: 0 },
    tableMinH: { type: Number, default: 0 },
    computedSectionHeight: { type: Number, default: 920 },
    computedTableHeight: { type: Number, default: 920 },
    selection: { type: Boolean, default: true },
    selectionFixed: { type: Boolean, default: true },
    selectionWidth: { type: [Number, String], default: 45 },
    emptyText: { type: String, default: '暂无数据' },
    showPager: { type: Boolean, default: true },
    pagerAlign: { type: String, default: 'end' },
    tableProps: { type: Object, default: () => ({}) },
    headerSticky: { type: Boolean, default: true },
    sortProp: { type: String, default: '' },
    sortOrder: { type: String, default: '' },
    rowHeight: { type: Number, default: 45 }
  },
  emits: ['reload','row-dblclick','update:page','update:limit','selection-change','sort-change'],
  computed: { baseProps(){ return { ...this.$props }; } }
};
</script>
<style scoped>
/* 仅薄包装，样式复用 BaseTableSection */
</style>
