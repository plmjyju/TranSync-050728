<template>
  <div class="page-wrap">
    <el-card class="form-card" shadow="never">
      <template #header>
        <div class="header-bar">
          <div class="title">新建入库单</div>
          <div class="actions">
            <el-button @click="$router.back()">返回</el-button>
            <el-button type="primary" :loading="saving" @click="onSubmit"
              >保存草稿</el-button
            >
          </div>
        </div>
      </template>

      <el-form :model="form" label-width="120px" class="form">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="运输方式">
              <el-select v-model="form.shipping_type" style="width: 100%">
                <el-option label="空运" value="air" />
                <el-option label="海运" value="sea" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="到仓方式">
              <el-input v-model="form.arrival_method" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="清关类型">
              <el-select v-model="form.clearance_type" style="width: 100%">
                <el-option label="T01" value="T01" />
                <el-option label="T11" value="T11" />
                <el-option label="T06-T01" value="T06-T01" />
                <el-option label="一般贸易(兼容)" value="general_trade" />
                <el-option label="保税仓(兼容)" value="bonded_warehouse" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" />
        </el-form-item>

        <el-alert
          type="info"
          title="保存草稿后，请在包裹列表中为该入库单逐一新增包裹，并为每个包裹选择操作需求与填写至少一条清关明细。"
          show-icon
        />
      </el-form>
    </el-card>
  </div>
</template>

<script>
import http from "../api/http";

export default {
  name: "InbondCreate",
  data() {
    return {
      saving: false,
      form: {
        shipping_type: "air",
        arrival_method: "",
        clearance_type: "T01",
        remark: "",
      },
    };
  },
  methods: {
    async onSubmit() {
      try {
        this.saving = true;
        const basePayload = {
          shipping_type: this.form.shipping_type,
          clearance_type: this.form.clearance_type,
          arrival_method: this.form.arrival_method,
          remark: this.form.remark,
        };
        const { data } = await http.post(
          "/api/client/create-inbond",
          basePayload
        );
        const inbond = data?.inbond;
        if (!inbond?.id) throw new Error("创建入库单失败");
        this.$message.success("保存成功，请继续新增包裹与明细");
        // 跳转到包裹列表并携带 inbond_id 便于筛选
        this.$router.replace({
          path: "/packages",
          query: { inbond_id: inbond.id },
        });
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || "保存失败";
        this.$message.error(msg);
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
.page-wrap {
  padding: 12px;
  background: #f8f8f8;
}
.form-card {
  max-width: 1200px;
  margin: 0 auto;
}
.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  font-size: 18px;
  font-weight: 600;
}
.form {
  padding: 8px 0;
}
</style>
