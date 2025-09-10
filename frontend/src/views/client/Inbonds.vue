<template>
  <div class="page-wrap">
    <el-card>
      <div class="toolbar">
        <el-input
          v-model="q"
          placeholder="搜索备注/编号"
          clearable
          @keyup.enter.native="load"
          style="width: 260px; margin-right: 8px"
        />
        <el-select
          v-model="status"
          placeholder="状态"
          clearable
          style="width: 160px; margin-right: 8px"
        >
          <el-option label="created" value="created" />
          <el-option label="submitted" value="submitted" />
          <el-option label="arrived" value="arrived" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
      </div>

      <el-table
        :data="rows"
        height="60vh"
        v-loading="loading"
        :header-cell-style="{ background: '#f8f9fa' }"
      >
        <el-table-column prop="id" label="ID" width="100" />
        <el-table-column prop="status" label="状态" width="140" />
        <el-table-column prop="shipping_type" label="运输方式" width="140" />
        <el-table-column prop="remark" label="备注" min-width="220" />
        <el-table-column prop="created_at" label="创建时间" width="200" />
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="load"
          @current-change="load"
        />
      </div>
    </el-card>
  </div>
</template>

<script>
import http from "../../api/http";

export default {
  name: "ClientInbonds",
  data() {
    return {
      page: 1,
      limit: 20,
      q: "",
      status: "",
      rows: [],
      total: 0,
      loading: false,
    };
  },
  created() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const { data } = await http.get("/api/client/inbonds", {
          params: {
            page: this.page,
            limit: this.limit,
            q: this.q,
            status: this.status,
          },
        });
        const arr = (data && (data.inbonds || data.data || data.rows)) || [];
        this.rows = arr;
        this.total = data.total || data.count || 0;
      } catch (e) {
        const msg = e?.response?.data?.message || "加载失败";
        this.$notify?.error?.({ title: "错误", message: msg });
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.page-wrap {
  padding: 16px;
}
.toolbar {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}
.pager {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
