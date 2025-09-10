<template>
  <div class="center">
    <el-result icon="warning" title="无权限" sub-title="您没有访问该页面的权限">
      <template #extra>
        <el-button type="primary" @click="$router.replace('/')"
          >返回首页</el-button
        >
      </template>
    </el-result>
  </div>
</template>
<script>
export default { name: "Forbidden403" };
</script>
<style scoped>
.center {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
