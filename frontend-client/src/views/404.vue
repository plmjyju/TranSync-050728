<template>
  <div class="center">
    <el-result icon="info" title="页面不存在" sub-title="请检查地址是否正确">
      <template #extra>
        <el-button type="primary" @click="$router.replace('/')"
          >返回首页</el-button
        >
      </template>
    </el-result>
  </div>
</template>
<script>
export default { name: "NotFound404" };
</script>
<style scoped>
.center {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
