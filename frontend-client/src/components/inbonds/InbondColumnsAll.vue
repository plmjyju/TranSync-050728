<template>
  <!-- 列定义通过插槽供父组件传入，也可做成独立组件以便按需复用 -->
  <slot />
</template>
<script>
export default { name: "InbondColumnsAll" };
</script>
