<template>
  <div class="page-wrap">
    <el-card class="full-card">
      <div class="toolbar">
        <el-input
          v-model="q"
          placeholder="搜索包裹码/运单"
          clearable
          @keyup.enter.native="load"
          style="width: 260px; margin-right: 8px"
        />
        <el-input
          v-model="inbondId"
          placeholder="入库单ID"
          clearable
          @keyup.enter.native="onInbondIdChange"
          style="width: 160px; margin-right: 8px"
        />
        <el-select
          v-model="status"
          placeholder="状态"
          clearable
          style="width: 160px; margin-right: 8px"
        >
          <el-option label="prepared" value="prepared" />
          <el-option label="received" value="received" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
      </div>

      <!-- Inbond 基本信息（当携带 inbond_id 时显示） -->
      <el-card v-if="inbondId" class="inbond-card" shadow="never">
        <template #header>
          <div class="header-flex">
            <div>
              <span class="hdr-label">入库单</span>
              <span class="code">{{ inbondInfo?.inbond_code || "-" }}</span>
              <el-tag
                size="small"
                :type="inbondInfo?.status === 'draft' ? 'info' : 'success'"
                style="margin-left: 8px"
              >
                {{ inbondInfo?.status || "—" }}
              </el-tag>
            </div>
            <div>
              <el-button @click="loadInbond" :loading="inbondLoading"
                >刷新</el-button
              >
              <el-button
                type="primary"
                :loading="inbondSaving"
                :disabled="!isDraft"
                @click="saveInbond"
                >保存基本信息</el-button
              >
              <el-button
                type="success"
                plain
                v-permission="'client.inbond.submit'"
                :disabled="!isDraft"
                :loading="submitting"
                @click="submitInbond"
                >提交入库单</el-button
              >
            </div>
          </div>
        </template>
        <el-form :model="inbondForm" label-width="120px">
          <el-row :gutter="12">
            <el-col :span="6">
              <el-form-item label="运输方式">
                <el-select
                  v-model="inbondForm.shipping_type"
                  style="width: 100%"
                  :disabled="!isDraft"
                >
                  <el-option label="空运" value="air" />
                  <el-option label="海运" value="sea" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="到仓方式">
                <el-input
                  v-model="inbondForm.arrival_method"
                  :disabled="!isDraft"
                />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="清关类型">
                <el-select
                  v-model="inbondForm.clearance_type"
                  style="width: 100%"
                  :disabled="!isDraft"
                >
                  <el-option label="T01" value="T01" />
                  <el-option label="T11" value="T11" />
                  <el-option label="T06-T01" value="T06-T01" />
                  <el-option label="一般贸易(兼容)" value="general_trade" />
                  <el-option label="保税仓(兼容)" value="bonded_warehouse" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="备注">
                <el-input v-model="inbondForm.remark" :disabled="!isDraft" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-alert
            v-if="isDraft"
            type="info"
            show-icon
            title="请先完善基本信息，然后新增包裹并为每个包裹填写至少一条明细，最后提交入库单。"
          />
        </el-form>
      </el-card>

      <div class="ops-bar">
        <el-button
          type="primary"
          v-permission="'client.package.create'"
          :disabled="inbondId && !isDraft"
          @click="openCreatePkg"
          >新增包裹</el-button
        >
        <el-button
          type="default"
          v-permission="'client.inbond.create'"
          @click="goCreateInbond"
          >新建入库单</el-button
        >
      </div>

      <el-card class="section-card" shadow="never">
        <div class="table-wrap">
          <el-table
            :data="rows"
            height="100%"
            v-loading="loading"
            :header-cell-style="{ background: '#f8f9fa' }"
          >
            <el-table-column prop="package_code" label="包裹码" width="200" />
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column prop="inbond_id" label="入库单ID" width="140" />
            <el-table-column prop="created_at" label="创建时间" width="200" />
            <el-table-column label="明细" width="150">
              <template #default="{ row }">
                <span>{{ itemCountMap[row.package_code] ?? "-" }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="260" fixed="right">
              <template #default="{ row }">
                <el-button
                  type="primary"
                  link
                  size="small"
                  v-permission="'client.package.item.add'"
                  @click="openAddItem(row)"
                  >添加明细</el-button
                >
                <el-divider direction="vertical" />
                <el-button
                  type="default"
                  link
                  size="small"
                  v-permission="'client.package.item.add'"
                  @click="openImportFromTemplate(row)"
                  >从模板导入</el-button
                >
              </template>
            </el-table-column>
          </el-table>
        </div>
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

      <el-dialog v-model="createVisible" title="新增包裹" width="600px">
        <el-form :model="createForm" label-width="120px">
          <el-form-item label="入库单ID">
            <el-input v-model="createForm.inbondId" />
          </el-form-item>
          <el-form-item label="操作需求">
            <el-select
              v-model="createForm.operation_requirement_code"
              filterable
              style="width: 100%"
            >
              <el-option
                v-for="r in allowedRequirements"
                :key="r.id"
                :label="`${r.requirement_code} - ${r.requirement_name}`"
                :value="r.requirement_code"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="重量(kg)">
            <el-input-number
              v-model="createForm.weight_kg"
              :min="0"
              :step="0.1"
            />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="createForm.remark" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="createVisible = false">取消</el-button>
          <el-button
            type="primary"
            :loading="savingPkg"
            @click="submitCreatePkg"
            >创建</el-button
          >
        </template>
      </el-dialog>

      <!-- 添加明细弹窗 -->
      <el-dialog v-model="addItemVisible" title="添加包裹明细" width="720px">
        <el-form :model="itemForm" label-width="120px">
          <el-form-item label="追踪号">
            <el-input v-model="itemForm.tracking_no" />
          </el-form-item>
          <el-form-item label="收件人">
            <div class="row2">
              <el-input v-model="itemForm.receiver_name" placeholder="姓名" />
              <el-input v-model="itemForm.receiver_phone" placeholder="电话" />
            </div>
            <div class="row2">
              <el-input
                v-model="itemForm.receiver_country"
                placeholder="国家"
              />
              <el-input
                v-model="itemForm.receiver_postcode"
                placeholder="邮编"
              />
            </div>
            <el-input
              v-model="itemForm.receiver_address1"
              placeholder="地址1"
            />
            <el-input
              v-model="itemForm.receiver_address2"
              placeholder="地址2"
            />
          </el-form-item>
          <el-form-item label="货物信息">
            <div class="row3">
              <el-input v-model="itemForm.hs_code" placeholder="HS Code" />
              <el-input
                v-model="itemForm.product_name_en"
                placeholder="品名(EN)"
              />
              <el-input
                v-model="itemForm.origin_country"
                placeholder="原产国"
              />
            </div>
            <div class="row3">
              <el-input-number
                v-model="itemForm.quantity"
                :min="1"
                placeholder="件数"
              />
              <el-input-number
                v-model="itemForm.unit_price"
                :min="0"
                :step="0.01"
                placeholder="单价"
              />
              <el-input-number
                v-model="itemForm.total_price"
                :min="0"
                :step="0.01"
                placeholder="总价"
              />
            </div>
          </el-form-item>
          <el-form-item label="尺寸/重量">
            <div class="row3">
              <el-input-number
                v-model="itemForm.length_cm"
                :min="0"
                placeholder="长"
              />
              <el-input-number
                v-model="itemForm.width_cm"
                :min="0"
                placeholder="宽"
              />
              <el-input-number
                v-model="itemForm.height_cm"
                :min="0"
                placeholder="高"
              />
            </div>
            <el-input-number
              v-model="itemForm.weight_kg"
              :min="0"
              :step="0.01"
              placeholder="重量(kg)"
            />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="itemForm.custom_note" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="addItemVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingItem" @click="submitAddItem"
            >保存</el-button
          >
        </template>
      </el-dialog>

      <!-- 从模板导入弹窗 -->
      <el-dialog v-model="importVisible" title="从模板导入明细" width="720px">
        <el-table
          :data="templateList"
          height="360px"
          @selection-change="onTplSelChange"
        >
          <el-table-column type="selection" width="48" />
          <el-table-column prop="sku" label="SKU" width="160" />
          <el-table-column prop="description_of_good" label="描述" />
          <el-table-column prop="hs_code" label="HS" width="120" />
          <el-table-column prop="qty" label="数量" width="80" />
        </el-table>
        <template #footer>
          <el-button @click="importVisible = false">取消</el-button>
          <el-button type="primary" :loading="importing" @click="submitImport"
            >导入所选</el-button
          >
        </template>
      </el-dialog>
    </el-card>
  </div>
</template>

<script>
import http from "../api/http";

export default {
  name: "ClientPackages",
  data() {
    return {
      page: 1,
      limit: 20,
      q: "",
      status: "",
      inbondId: this.$route.query.inbond_id || "",
      rows: [],
      total: 0,
      loading: false,
      // inbond
      inbondInfo: null,
      inbondForm: {
        shipping_type: "air",
        arrival_method: "",
        clearance_type: "T01",
        remark: "",
      },
      inbondLoading: false,
      inbondSaving: false,
      submitting: false,
      // create
      createVisible: false,
      savingPkg: false,
      createForm: {
        inbondId: this.$route.query.inbond_id || "",
        operation_requirement_code: "",
        weight_kg: 0,
        remark: "",
      },
      allowedRequirements: [],
      // items
      addItemVisible: false,
      savingItem: false,
      currentPackage: null,
      itemForm: {
        tracking_no: "",
        receiver_name: "",
        receiver_phone: "",
        receiver_country: "",
        receiver_postcode: "",
        receiver_address1: "",
        receiver_address2: "",
        hs_code: "",
        product_name_en: "",
        origin_country: "",
        quantity: 1,
        unit_price: null,
        total_price: null,
        length_cm: null,
        width_cm: null,
        height_cm: null,
        weight_kg: null,
        custom_note: "",
      },
      // import from templates
      importVisible: false,
      importing: false,
      templateList: [],
      selectedTplIds: [],
      // item counts cache
      itemCountMap: {},
    };
  },
  computed: {
    isDraft() {
      return (this.inbondInfo?.status || "draft") === "draft";
    },
  },
  created() {
    this.load();
    if (this.inbondId) this.loadInbond();
  },
  methods: {
    async onInbondIdChange() {
      // 同步路由参数
      const q = { ...this.$route.query };
      if (this.inbondId) q.inbond_id = this.inbondId;
      else delete q.inbond_id;
      this.$router.replace({ path: this.$route.path, query: q });
      if (this.inbondId) await this.loadInbond();
      await this.load();
    },
    async loadInbond() {
      if (!this.inbondId) return;
      this.inbondLoading = true;
      try {
        const { data } = await http.get(`/api/client/inbond/${this.inbondId}`);
        const model = data?.inbond;
        if (model) {
          this.inbondInfo = model;
          this.inbondForm = {
            shipping_type: model.shipping_type || "air",
            arrival_method: model.arrival_method || "",
            clearance_type: model.clearance_type || "T01",
            remark: model.remark || "",
          };
          // 新包裹弹窗默认填入 inbondId
          if (!this.createForm.inbondId)
            this.createForm.inbondId = this.inbondId;
        }
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "加载入库单失败");
      } finally {
        this.inbondLoading = false;
      }
    },
    async saveInbond() {
      if (!this.inbondId) return;
      this.inbondSaving = true;
      try {
        await http.put(`/api/client/inbond/${this.inbondId}`, {
          shipping_type: this.inbondForm.shipping_type,
          arrival_method: this.inbondForm.arrival_method,
          clearance_type: this.inbondForm.clearance_type,
          remark: this.inbondForm.remark,
        });
        this.$message.success("已保存");
        await this.loadInbond();
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "保存失败");
      } finally {
        this.inbondSaving = false;
      }
    },
    async submitInbond() {
      if (!this.inbondId) return;
      this.submitting = true;
      try {
        const { data } = await http.post(
          `/api/client/inbond/${this.inbondId}/submit`
        );
        this.$message.success(data?.message || "提交成功");
        await this.loadInbond();
        await this.load();
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "提交失败");
      } finally {
        this.submitting = false;
      }
    },
    async load() {
      this.loading = true;
      try {
        const { data } = await http.get("/api/client/packages", {
          params: {
            page: this.page,
            pageSize: this.limit,
            status: this.status,
            inbond_id: this.inbondId || undefined,
            code: this.q || undefined,
          },
        });
        const arr = (data && (data.packages || data.data || data.rows)) || [];
        this.rows = arr;
        this.total = data.total || data.count || 0;
        // 并行加载每个包裹的明细数量
        this.itemCountMap = {};
        await Promise.all(
          arr.map(async (row) => {
            try {
              const r = await http.get(
                `/api/client/package/by-code/${row.package_code}`
              );
              const code = r?.data?.package?.package_code || row.package_code;
              const items = await http.get(`/api/client/package/${code}/items`);
              this.$set?.(
                this.itemCountMap,
                code,
                (items?.data?.items || []).length
              );
            } catch {
              this.$set?.(this.itemCountMap, row.package_code, "-");
            }
          })
        );
      } catch (e) {
        const msg = e?.response?.data?.message || "加载失败";
        this.$notify?.error?.({ title: "错误", message: msg });
      } finally {
        this.loading = false;
      }
    },
    async openCreatePkg() {
      try {
        const { data } = await http.get(
          "/api/common/operation-requirements/user-allowed"
        );
        this.allowedRequirements = data?.requirements || [];
        if (!this.createForm.inbondId) this.createForm.inbondId = this.inbondId;
        this.createVisible = true;
      } catch {
        this.$message.error("加载可选操作需求失败");
      }
    },
    async submitCreatePkg() {
      if (!this.createForm.inbondId)
        return this.$message.warning("请填写入库单ID");
      if (!this.createForm.operation_requirement_code)
        return this.$message.warning("请选择操作需求");
      this.savingPkg = true;
      try {
        await http.post(
          `/api/client/inbond/${this.createForm.inbondId}/add-package`,
          {
            operation_requirement_code:
              this.createForm.operation_requirement_code,
            weight_kg: this.createForm.weight_kg,
            remark: this.createForm.remark,
          }
        );
        this.$message.success("创建成功，请继续添加明细");
        this.createVisible = false;
        await this.load();
      } catch (e) {
        const msg = e?.response?.data?.message || "创建失败";
        this.$message.error(msg);
      } finally {
        this.savingPkg = false;
      }
    },
    goCreateInbond() {
      this.$router.push({ path: "/inbonds/new" });
    },
    // add item
    openAddItem(row) {
      this.currentPackage = row;
      this.itemForm = {
        tracking_no: "",
        receiver_name: "",
        receiver_phone: "",
        receiver_country: "",
        receiver_postcode: "",
        receiver_address1: "",
        receiver_address2: "",
        hs_code: "",
        product_name_en: "",
        origin_country: "",
        quantity: 1,
        unit_price: null,
        total_price: null,
        length_cm: null,
        width_cm: null,
        height_cm: null,
        weight_kg: null,
        custom_note: "",
      };
      this.addItemVisible = true;
    },
    async submitAddItem() {
      if (!this.currentPackage) return;
      this.savingItem = true;
      try {
        const code = this.currentPackage.package_code;
        await http.post(`/api/client/package/${code}/add-item`, this.itemForm);
        this.$message.success("已添加");
        this.addItemVisible = false;
        await this.load();
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "添加失败");
      } finally {
        this.savingItem = false;
      }
    },
    // import from templates
    async openImportFromTemplate(row) {
      this.currentPackage = row;
      try {
        const { data } = await http.get("/api/client/item-templates");
        this.templateList = data?.items || [];
        this.selectedTplIds = [];
        this.importVisible = true;
      } catch {
        this.$message.error("加载模板失败");
      }
    },
    onTplSelChange(selection) {
      this.selectedTplIds = (selection || []).map((x) => x.id);
    },
    async submitImport() {
      if (!this.currentPackage) return;
      if (!this.selectedTplIds.length) {
        return this.$message.warning("请选择模板");
      }
      this.importing = true;
      try {
        const code = this.currentPackage.package_code;
        await http.post(
          `/api/client/package/${code}/add-items-from-templates`,
          {
            template_ids: this.selectedTplIds,
          }
        );
        this.$message.success("导入成功");
        this.importVisible = false;
        await this.load();
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "导入失败");
      } finally {
        this.importing = false;
      }
    },
  },
};
</script>

<style scoped>
.page-wrap {
  height: 100%;
  padding: 0;
}
.full-card {
  height: 100%;
  border: 0;
  border-radius: 0;
  box-shadow: none !important;
}
:deep(.el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
}
.toolbar {
  padding: 12px;
  display: flex;
  align-items: center;
}
.inbond-card {
  margin: 0 12px 8px;
}
.header-flex {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hdr-label {
  color: #999;
  margin-right: 8px;
}
.code {
  font-weight: 600;
}
.ops-bar {
  padding: 0 12px 8px;
  display: flex;
  justify-content: flex-end;
}
.section-card {
  flex: 1;
  margin: 8px 12px 12px;
  box-shadow: none !important;
}
:deep(.section-card .el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
}
.table-wrap {
  flex: 1;
  min-height: 0;
}
.pager {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-top: 1px solid #f0f2f5;
}
.row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.row3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}
</style>
