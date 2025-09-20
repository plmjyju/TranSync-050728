<template>
  <div class="ts-page" :class="{ 'is-dense': dense, 'no-padding': noPadding }">
    <header v-if="$slots.header" class="ts-page__header">
      <slot name="header" />
    </header>
    <section v-if="$slots.toolbar" class="ts-page__toolbar">
      <slot name="toolbar" />
    </section>
    <main class="ts-page__content">
      <slot />
    </main>
    <footer v-if="$slots.footer" class="ts-page__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>
<script>
export default {
  name: 'BasePageLayout',
  props: { dense: { type: Boolean, default: false }, noPadding: { type: Boolean, default: false } }
};
</script>
<style scoped>
.ts-page{ display:flex; flex-direction:column; gap: var(--section-gap, 16px); height:100%; }
.ts-page__header{ padding: 0 var(--ts-horizontal-gap, 16px); }
.ts-page__toolbar{ padding: 0 var(--ts-horizontal-gap, 16px); }
.ts-page__content{ flex:1 1 auto; min-height:0; display:flex; flex-direction:column; }
.ts-page__footer{ padding: var(--space-3, 12px) var(--ts-horizontal-gap, 16px); border-top:1px solid var(--ts-border-color, #eee); background:#fff; }
.ts-page.no-padding .ts-page__content{ padding:0; }
.ts-page.is-dense{ --section-gap: 12px; }
</style>
