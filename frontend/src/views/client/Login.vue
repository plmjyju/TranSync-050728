<template>
  <div class="login-wrap">
    <el-card class="login-card">
      <h2 style="margin: 0 0 16px">Client 登录</h2>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="loading"
            @click="onSubmit"
            style="width: 100%"
            >登录</el-button
          >
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script>
import http from "../../api/http";

export default {
  name: "ClientLogin",
  data() {
    return {
      form: { username: "", password: "" },
      rules: {
        username: [
          { required: true, message: "请输入用户名", trigger: "blur" },
        ],
        password: [{ required: true, message: "请输入密码", trigger: "blur" }],
      },
      loading: false,
    };
  },
  methods: {
    async onSubmit() {
      this.$refs.formRef.validate(async (ok) => {
        if (!ok) return;
        this.loading = true;
        try {
          const { data } = await http.post("/api/client/login", this.form);
          localStorage.setItem("token_client", data.token || "");
          this.$router.replace("/client");
        } catch (e) {
          const msg = e?.response?.data?.message || "登录失败，请检查账号密码";
          this.$notify?.error?.({ title: "登录失败", message: msg });
        } finally {
          this.loading = false;
        }
      });
    },
  },
};
</script>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-card {
  width: 360px;
}
</style>
