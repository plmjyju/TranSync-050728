<template>
  <el-drawer v-model="innerVisible" size="80%" :with-header="false">
    <div class="editor-wrap">
      <el-card class="editor-head" shadow="never">
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
            <el-button @click="refreshEditor" :loading="inbondLoading"
              >刷新</el-button
            >
            <el-button
              type="primary"
              :loading="inbondSaving"
              :disabled="!isEditorDraft"
              @click="saveInbond"
              >保存基本信息</el-button
            >
            <el-button
              type="success"
              plain
              v-permission="['client.inbond.submit']"
              :disabled="!isEditorDraft"
              :loading="submitting"
              @click="submitInbond"
              >提交入库单</el-button
            >
            <el-button @click="close">关闭</el-button>
          </div>
        </div>
      </el-card>

      <el-card class="editor-section" shadow="never">
        <el-form :model="inbondForm" label-width="120px">
          <el-row :gutter="12">
            <el-col :span="6">
              <el-form-item label="运输方式">
                <el-select
                  v-model="inbondForm.shipping_type"
                  style="width: 100%"
                  :disabled="!isEditorDraft"
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
                  :disabled="!isEditorDraft"
                />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="清关类型">
                <el-select
                  v-model="inbondForm.clearance_type"
                  style="width: 100%"
                  :disabled="!isEditorDraft"
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
                <el-input
                  v-model="inbondForm.remark"
                  :disabled="!isEditorDraft"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-alert
            v-if="isEditorDraft"
            type="info"
            show-icon
            title="请先完善基本信息，然后新增包裹并为每个包裹填写至少一条明细，最后提交入库单。"
          />
        </el-form>
      </el-card>

      <el-card class="editor-section" shadow="never">
        <template #header>
          <div class="header-flex">
            <div>包裹列表</div>
            <div>
              <el-button
                type="primary"
                v-permission="['client.package.create']"
                :disabled="!isEditorDraft"
                @click="addInlinePackage"
                >新增包裹</el-button
              >
              <el-radio-group
                v-model="unitMode"
                size="small"
                style="margin-left: 12px"
              >
                <el-radio-button label="metric">公制(cm/kg)</el-radio-button>
                <el-radio-button label="imperial">英制(in/lb)</el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </template>
        <el-table
          :data="pkgRows"
          height="360"
          v-loading="pkgLoading"
          :header-cell-style="{ background: '#f8f9fa' }"
          @row-dblclick="onPkgRowDblClick"
        >
          <el-table-column prop="package_code" label="包裹码" width="180">
            <template #default="{ row }">
              <span v-if="!row.isNew">{{ row.package_code }}</span>
              <el-tag v-else type="info">新包裹（未保存）</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="110">
            <template #default="{ row }">
              <span v-if="!row.isNew">{{ row.status }}</span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作需求" width="240">
            <template #default="{ row }">
              <template v-if="row.isNew">
                <el-select
                  v-model="row._draft.operation_requirement_code"
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
              </template>
              <template v-else>
                <span>{{
                  row.operation_requirement_code ||
                  row.operation_requirement?.requirement_code ||
                  "-"
                }}</span>
              </template>
            </template>
          </el-table-column>
          <el-table-column :label="`重量(${weightUnit})`" width="160">
            <template #default="{ row }">
              <template v-if="row.isNew">
                <el-input v-model="row._draft.weight" type="number" />
              </template>
              <template v-else>
                <span>{{ fmtWeight(row.weight_kg) }}</span>
              </template>
            </template>
          </el-table-column>
          <el-table-column :label="`长(${lengthUnit})`" width="140">
            <template #default="{ row }">
              <template v-if="row.isNew">
                <el-input v-model="row._draft.length" type="number" />
              </template>
              <template v-else>
                <span>{{ fmtDim(row.length_cm) }}</span>
              </template>
            </template>
          </el-table-column>
          <el-table-column :label="`宽(${lengthUnit})`" width="140">
            <template #default="{ row }">
              <template v-if="row.isNew">
                <el-input v-model="row._draft.width" type="number" />
              </template>
              <template v-else>
                <span>{{ fmtDim(row.width_cm) }}</span>
              </template>
            </template>
          </el-table-column>
          <el-table-column :label="`高(${lengthUnit})`" width="140">
            <template #default="{ row }">
              <template v-if="row.isNew">
                <el-input v-model="row._draft.height" type="number" />
              </template>
              <template v-else>
                <span>{{ fmtDim(row.height_cm) }}</span>
              </template>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="200">
            <template #default="{ row }">
              <template v-if="row.isNew">
                <el-input v-model="row._draft.remark" placeholder="备注" />
              </template>
              <template v-else>
                <span>{{ row.remark || "-" }}</span>
              </template>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="180">
            <template #default="{ row }">
              <span v-if="!row.isNew">{{ row.created_at }}</span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="明细" width="100">
            <template #default="{ row }">
              <template v-if="row.isNew">
                <span>—</span>
              </template>
              <template v-else>
                <el-link
                  type="primary"
                  :underline="false"
                  @click="openItemsEditor(row)"
                  >{{ itemCountMap[row.package_code] ?? "-" }}</el-link
                >
              </template>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="300" fixed="right">
            <template #default="{ row }">
              <template v-if="row.isNew">
                <el-button
                  type="primary"
                  link
                  size="small"
                  :loading="row._saving"
                  @click="saveInlinePackage(row)"
                  >保存</el-button
                >
                <el-divider direction="vertical" />
                <el-button
                  type="default"
                  link
                  size="small"
                  @click="cancelInlinePackage(row)"
                  >取消</el-button
                >
              </template>
              <template v-else>
                <el-button
                  type="primary"
                  link
                  size="small"
                  @click="openItemsEditor(row)"
                  >编辑明细</el-button
                >
                <el-divider direction="vertical" />
                <el-button
                  type="default"
                  link
                  size="small"
                  v-permission="['client.package.item.add']"
                  @click="openImportFromTemplate(row)"
                  >从模板导入</el-button
                >
              </template>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 明细表格编辑 Dialog -->
      <el-dialog v-model="itemsVisible" title="编辑包裹明细" width="1180px">
        <div class="items-toolbar">
          <div class="left">
            <el-button type="primary" size="small" @click="addItemRow"
              >新增一行</el-button
            >
            <el-button
              type="success"
              size="small"
              :loading="savingItems"
              @click="saveItemsBulk"
              >保存全部</el-button
            >
          </div>
          <div class="right">
            <el-tag v-if="currentPackage" type="info">{{
              currentPackage.package_code
            }}</el-tag>
            <el-button
              style="margin-left: 8px"
              size="small"
              v-permission="['client.package.item.add']"
              @click="openAddNewItemDialog()"
              >新物品</el-button
            >
          </div>
        </div>
        <el-table
          :data="itemsRows"
          height="520"
          v-loading="itemsLoading"
          :header-cell-style="{ background: '#f8f9fa' }"
        >
          <el-table-column type="index" width="50" label="#" />
          <el-table-column label="物品名称" min-width="300">
            <template #default="{ row }">
              <template v-if="row._rowLocked || row._nameLocked">
                <span class="locked-name">{{
                  row.product_description || "-"
                }}</span>
              </template>
              <template v-else>
                <el-autocomplete
                  v-model="row.product_description"
                  :fetch-suggestions="makeQueryItemNameSuggestions(row)"
                  placeholder="物品名称/描述"
                  clearable
                  :trigger-on-focus="true"
                  @select="onItemNameSelect(row, $event)"
                  @change="markRowDirty(row)"
                  @blur="onItemNameBlur(row)"
                  style="width: 100%"
                >
                  <template #default="{ item }">
                    <div v-if="item.__create" class="ac-create">
                      ＋ 新物品：<b>{{ item.keyword }}</b>
                    </div>
                    <div
                      v-else
                      class="ac-item"
                      :class="{ 'ac-disabled': item.disabled }"
                    >
                      {{ item.value }}
                      <span v-if="item.disabled" class="ac-flag">（已选）</span>
                    </div>
                  </template>
                </el-autocomplete>
              </template>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="140">
            <template #default="{ row }">
              <el-input
                v-model.number="row.quantity"
                type="number"
                min="0"
                placeholder="0"
                :disabled="row._rowLocked"
                @input="markRowDirty(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="总价" width="180">
            <template #default="{ row }">
              <el-input
                v-model.number="row.total_price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                :disabled="row._rowLocked"
                @input="markRowDirty(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="260">
            <template #default="{ row }">
              <el-input
                v-model="row.custom_note"
                placeholder="备注"
                :disabled="row._rowLocked"
                @input="markRowDirty(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row, $index }">
              <template v-if="row._rowLocked">
                <el-button
                  type="primary"
                  link
                  size="small"
                  @click="unlockRow(row)"
                  >编辑</el-button
                >
              </template>
              <template v-else>
                <el-button
                  type="primary"
                  link
                  size="small"
                  :disabled="!isRowValid(row)"
                  :loading="row._quickSaving"
                  @click="quickSaveItem(row, $index)"
                  >保存</el-button
                >
                <el-divider direction="vertical" />
                <el-popconfirm
                  title="删除该行?"
                  @confirm="deleteItemRow(row, $index)"
                >
                  <template #reference>
                    <el-button type="danger" link size="small">删</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </template>
          </el-table-column>
        </el-table>
        <template #footer>
          <span style="flex: 1"></span>
          <el-button @click="itemsVisible = false">关闭</el-button>
          <el-button
            type="primary"
            :loading="savingItems"
            @click="saveItemsBulk"
            >保存全部</el-button
          >
        </template>
      </el-dialog>

      <!-- 新物品弹窗（创建模板，供下次联想） -->
      <el-dialog v-model="addNewItemVisible" title="新物品" width="620px">
        <el-form label-width="96px">
          <el-form-item label="物品名称">
            <el-input
              v-model="newItemForm.product_name"
              placeholder="必填（最长200）"
            />
          </el-form-item>
          <el-form-item label="用途/描述">
            <el-input
              v-model="newItemForm.product_description"
              placeholder="可选（最长500）"
            />
          </el-form-item>

          <el-form-item label="单位">
            <el-radio-group v-model="newItemUnitMode" size="small">
              <el-radio-button label="metric">公制(cm/kg)</el-radio-button>
              <el-radio-button label="imperial">英制(in/lb)</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <div class="row3">
            <el-form-item :label="`长(${newItemLengthUnit})`">
              <el-input
                v-model.number="newItemForm.length"
                type="number"
                placeholder="0"
              >
                <template #append>{{ newItemLengthUnit }}</template>
              </el-input>
            </el-form-item>
            <el-form-item :label="`宽(${newItemLengthUnit})`">
              <el-input
                v-model.number="newItemForm.width"
                type="number"
                placeholder="0"
              >
                <template #append>{{ newItemLengthUnit }}</template>
              </el-input>
            </el-form-item>
            <el-form-item :label="`高(${newItemLengthUnit})`">
              <el-input
                v-model.number="newItemForm.height"
                type="number"
                placeholder="0"
              >
                <template #append>{{ newItemLengthUnit }}</template>
              </el-input>
            </el-form-item>
          </div>

          <div class="row2">
            <el-form-item :label="`重量(${newItemWeightUnit})`">
              <el-input
                v-model.number="newItemForm.weight"
                type="number"
                placeholder="0"
              >
                <template #append>{{ newItemWeightUnit }}</template>
              </el-input>
            </el-form-item>
            <el-form-item label="价格">
              <el-input
                v-model.number="newItemForm.price"
                type="number"
                placeholder="0.00"
                step="0.01"
              />
            </el-form-item>
          </div>

          <el-form-item label="材质">
            <el-input v-model="newItemForm.material" />
          </el-form-item>
          <el-form-item label="产地">
            <el-input v-model="newItemForm.origin_country" />
          </el-form-item>
          <el-form-item label="HS Code">
            <el-input v-model="newItemForm.hs_code" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="addNewItemVisible = false">取消</el-button>
          <el-button type="primary" @click="submitNewItem">创建</el-button>
        </template>
      </el-dialog>
    </div>
  </el-drawer>
</template>

<script>
import http from "../../api/http";

export default {
  name: "InbondEditorDrawer",
  props: {
    visible: { type: Boolean, default: false },
    currentInbondId: { type: [String, Number], default: "" },
  },
  emits: ["update:visible", "updated"],
  data() {
    return {
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
      unitMode: "metric",
      // packages
      pkgRows: [],
      pkgLoading: false,
      itemCountMap: {},
      // dialogs
      itemsVisible: false,
      itemsLoading: false,
      itemsRows: [],
      savingItems: false,
      itemNameCache: [],
      addNewItemVisible: false,
      addNewItemTargetRow: null,
      newItemUnitMode: "metric",
      newItemForm: {
        product_name: "",
        product_description: "",
        material: "",
        origin_country: "",
        hs_code: "",
        length: null,
        width: null,
        height: null,
        weight: null,
        price: null,
      },
      allowedRequirements: [],
      currentPackage: null,
    };
  },
  computed: {
    innerVisible: {
      get() {
        return this.visible;
      },
      set(v) {
        this.$emit("update:visible", v);
      },
    },
    isEditorDraft() {
      return (this.inbondInfo?.status || "draft") === "draft";
    },
    isImperial() {
      return this.unitMode === "imperial";
    },
    weightUnit() {
      return this.isImperial ? "lb" : "kg";
    },
    lengthUnit() {
      return this.isImperial ? "in" : "cm";
    },
    newItemLengthUnit() {
      return this.newItemUnitMode === "imperial" ? "in" : "cm";
    },
    newItemWeightUnit() {
      return this.newItemUnitMode === "imperial" ? "lb" : "kg";
    },
  },
  watch: {
    innerVisible(val) {
      if (val && this.currentInbondId) this.refreshEditor();
    },
    currentInbondId(val) {
      if (this.innerVisible && val) this.refreshEditor();
    },
  },
  methods: {
    async refreshEditor() {
      await Promise.all([this.loadInbond(), this.loadInbondPackages()]);
    },
    async loadInbond() {
      if (!this.currentInbondId) return;
      this.inbondLoading = true;
      try {
        const { data } = await http.get(
          `/api/client/inbond/${this.currentInbondId}`
        );
        const model = data?.inbond || data;
        if (model) {
          this.inbondInfo = model;
          this.inbondForm = {
            shipping_type: model.shipping_type || "air",
            arrival_method: model.arrival_method || "",
            clearance_type: model.clearance_type || "T01",
            remark: model.remark || "",
          };
        }
      } finally {
        this.inbondLoading = false;
      }
    },
    async saveInbond() {
      if (!this.currentInbondId) return;
      this.inbondSaving = true;
      try {
        await http.put(`/api/client/inbond/${this.currentInbondId}`, {
          shipping_type: this.inbondForm.shipping_type,
          arrival_method: this.inbondForm.arrival_method,
          clearance_type: this.inbondForm.clearance_type,
          remark: this.inbondForm.remark,
        });
        this.$message.success("已保存");
        await this.loadInbond();
        this.$emit("updated");
      } finally {
        this.inbondSaving = false;
      }
    },
    async submitInbond() {
      if (!this.currentInbondId) return;
      this.submitting = true;
      try {
        const { data } = await http.post(
          `/api/client/inbond/${this.currentInbondId}/submit`
        );
        this.$message.success(data?.message || "提交成功");
        await this.refreshEditor();
        this.$emit("updated");
      } finally {
        this.submitting = false;
      }
    },
    async loadInbondPackages() {
      if (!this.currentInbondId) return;
      this.pkgLoading = true;
      try {
        const { data } = await http.get("/api/client/packages", {
          params: { page: 1, pageSize: 200, inbond_id: this.currentInbondId },
        });
        const arr = (data && (data.packages || data.data || data.rows)) || [];
        this.pkgRows = arr;
        this.itemCountMap = {};
        await Promise.all(
          arr.map(async (row) => {
            try {
              const items = await http.get(
                `/api/client/package/${row.package_code}/items`
              );
              const count = (items?.data?.items || []).length;
              this.itemCountMap[row.package_code] = count;
            } catch {
              this.itemCountMap[row.package_code] = "-";
            }
          })
        );
      } finally {
        this.pkgLoading = false;
      }
    },
    async ensureAllowedRequirements() {
      if (this.allowedRequirements && this.allowedRequirements.length) return;
      const { data } = await http.get(
        "/api/common/operation-requirements/user-allowed"
      );
      this.allowedRequirements = data?.requirements || [];
    },
    async addInlinePackage() {
      if (!this.isEditorDraft) return;
      await this.ensureAllowedRequirements();
      const defReq = this.allowedRequirements[0]?.requirement_code || "";
      const draft = {
        isNew: true,
        package_code: "",
        status: "",
        created_at: "",
        _draft: {
          operation_requirement_code: defReq,
          weight: 0,
          length: null,
          width: null,
          height: null,
          remark: "",
        },
      };
      this.pkgRows = [draft, ...this.pkgRows];
    },
    async saveInlinePackage(row) {
      if (!this.currentInbondId) return;
      if (!row?._draft?.operation_requirement_code)
        return this.$message.warning("请选择操作需求");
      row._saving = true;
      try {
        const payload = {
          operation_requirement_code: row._draft.operation_requirement_code,
          weight_kg: this.isImperial
            ? this.toKg(row._draft.weight)
            : row._draft.weight,
          remark: row._draft.remark,
        };
        const maybeSet = (kDisplay, kPayload) => {
          const v = row._draft[kDisplay];
          if (v !== null && v !== undefined && v !== "") {
            const cm = this.isImperial ? this.toCm(v) : Number(v);
            if (cm !== null) payload[kPayload] = cm;
          }
        };
        maybeSet("length", "length_cm");
        maybeSet("width", "width_cm");
        maybeSet("height", "height_cm");
        const { data } = await http.post(
          `/api/client/inbond/${this.currentInbondId}/add-package`,
          payload
        );
        const created = data?.package || data?.data || null;
        if (created) {
          const idx = this.pkgRows.indexOf(row);
          if (idx >= 0) this.pkgRows.splice(idx, 1, created);
          this.itemCountMap[created.package_code] = 0;
        } else {
          await this.loadInbondPackages();
        }
        this.$message.success("创建成功，请继续添加明细");
      } finally {
        row._saving = false;
      }
    },
    cancelInlinePackage(row) {
      const idx = this.pkgRows.indexOf(row);
      if (idx >= 0) this.pkgRows.splice(idx, 1);
    },
    onPkgRowDblClick(row) {
      if (!row || row.isNew) return;
      this.openItemsEditor(row);
    },
    openItemsEditor(row) {
      this.currentPackage = row;
      this.itemsVisible = true;
      Promise.all([this.loadItemsOf(row), this.loadItemSuggestions("")]);
    },
    async loadItemsOf(row) {
      this.itemsLoading = true;
      try {
        const code = row.package_code;
        const { data } = await http.get(`/api/client/package/${code}/items`);
        const list = (data?.items || []).map((it) => ({
          id: it.id,
          product_description: it.product_description || "",
          quantity: it.quantity ?? null,
          total_price: it.total_price ?? null,
          custom_note: it.custom_note || "",
          _dirty: false,
          _nameLocked: !!it.id,
          _rowLocked: !!it.id,
        }));
        this.itemsRows = list;
      } finally {
        this.itemsLoading = false;
      }
    },
    addItemRow() {
      this.itemsRows.push({
        product_description: "",
        quantity: null,
        total_price: null,
        custom_note: "",
        _dirty: true,
        _nameLocked: false,
        _rowLocked: false,
      });
    },
    unlockRow(row) {
      row._rowLocked = false;
      row._nameLocked = false;
    },
    makeQueryItemNameSuggestions(row) {
      return (queryString, cb) =>
        this.queryItemNameSuggestionsWithRow(row, queryString, cb);
    },
    queryItemNameSuggestionsWithRow(row, queryString, cb) {
      const kw = (queryString || "").trim();
      const base = this.itemNameCache || [];
      const used = new Set(
        (this.itemsRows || [])
          .map((r) => (r.product_description || "").trim())
          .filter((v) => v)
      );
      const currentVal = (row.product_description || "").trim();
      if (currentVal) used.delete(currentVal);
      const filtered = kw ? base.filter((v) => v.includes(kw)) : base;
      const list = [];
      if (kw) {
        list.push({
          value: `＋ 新物品：${kw}`,
          __create: true,
          keyword: kw,
          disabled: false,
        });
      }
      list.push(...filtered.map((v) => ({ value: v, disabled: used.has(v) })));
      cb(list);
    },
    onItemNameSelect(row, item) {
      if (item && item.__create) {
        this.openAddNewItemDialog(item.keyword, row);
        row.product_description = item.keyword;
        this.markRowDirty(row);
        return;
      }
      if (item && item.disabled) {
        this.$message.warning("该物品已在本明细中选择");
        return;
      }
      if (item && item.value) {
        row.product_description = item.value;
        row._nameLocked = true;
        this.markRowDirty(row);
      }
    },
    onItemNameBlur(row) {
      const val = (row.product_description || "").trim();
      if (!val) return;
      if (
        Array.isArray(this.itemNameCache) &&
        this.itemNameCache.includes(val)
      ) {
        row._nameLocked = true;
      }
    },
    markRowDirty(row) {
      if (row && typeof row === "object") {
        row._dirty = true;
      }
    },
    isRowValid(row) {
      const name = (row?.product_description || "").trim();
      return !!name;
    },
    async quickSaveItem(row, index) {
      if (!this.currentPackage) return;
      if (!this.isRowValid(row)) return this.$message.warning("请检查该行填写");
      row._quickSaving = true;
      try {
        const payload = {
          product_description: (row.product_description || "").trim() || null,
          quantity:
            row.quantity != null && row.quantity !== ""
              ? Number(row.quantity)
              : null,
          total_price:
            row.total_price != null && row.total_price !== ""
              ? Number(row.total_price)
              : null,
          custom_note: (row.custom_note || "").trim() || null,
        };
        if (row.id) {
          await http.put(`/api/client/item/${row.id}`, payload);
        } else {
          await http.post(
            `/api/client/package/${this.currentPackage.package_code}/items/bulk`,
            { items: [payload] }
          );
        }
        row._rowLocked = true;
        this.$message.success("已保存");
      } finally {
        row._quickSaving = false;
      }
    },
    async saveItemsBulk() {
      if (!this.currentPackage) return;
      this.savingItems = true;
      try {
        const items = this.itemsRows.map((r) => ({
          id: r.id,
          product_description: (r.product_description || "").trim() || null,
          quantity:
            r.quantity != null && r.quantity !== "" ? Number(r.quantity) : null,
          total_price:
            r.total_price != null && r.total_price !== ""
              ? Number(r.total_price)
              : null,
          custom_note: (r.custom_note || "").trim() || null,
        }));
        await http.post(
          `/api/client/package/${this.currentPackage.package_code}/items/bulk`,
          { items }
        );
        this.itemsRows.forEach((r) => {
          if (this.isRowValid(r)) r._rowLocked = true;
        });
        this.$message.success("保存成功");
      } finally {
        this.savingItems = false;
      }
    },
    async loadItemSuggestions(keyword = "") {
      try {
        const { data } = await http.get(
          "/api/client/package-items/suggestions",
          { params: { keyword, limit: 50 } }
        );
        const list = (data?.suggestions || [])
          .map(
            (s) =>
              s.product_name || s.product_description || s.product_name_en || ""
          )
          .filter(Boolean);
        this.itemNameCache = Array.from(new Set(list));
      } catch {
        /* ignore */
      }
    },
    openAddNewItemDialog(keyword = "", targetRow = null) {
      this.addNewItemTargetRow = targetRow;
      this.newItemForm = {
        product_name: (keyword || "").trim(),
        product_description: (keyword || "").trim(),
        material: "",
        origin_country: "",
        hs_code: "",
        length: null,
        width: null,
        height: null,
        weight: null,
        price: null,
      };
      this.newItemUnitMode = "metric";
      this.addNewItemVisible = true;
    },
    async submitNewItem() {
      const name = (this.newItemForm.product_name || "").trim();
      if (!name) return this.$message.warning("请填写物品名称");
      const desc = (this.newItemForm.product_description || "").trim();
      const payloadFull = {
        product_name: name,
        product_description: desc || null,
        material: this.newItemForm.material || null,
        origin_country: this.newItemForm.origin_country || null,
        hs_code: this.newItemForm.hs_code || null,
        unit_system: this.newItemUnitMode,
        length: this.newItemForm.length,
        width: this.newItemForm.width,
        height: this.newItemForm.height,
        weight: this.newItemForm.weight,
        price: this.newItemForm.price,
      };
      const bodies = [payloadFull, { template: payloadFull }];
      let createdOk = false,
        lastErr;
      for (const body of bodies) {
        try {
          await http.post("/api/client/item-templates", body, {
            headers: { "Content-Type": "application/json" },
          });
          createdOk = true;
          break;
        } catch (e) {
          lastErr = e;
          const status = e?.response?.status;
          if (!(status === 400 || status === 409 || status === 422)) break;
          const code = e?.response?.data?.code;
          if (code && code !== "ITEM_DESC_REQUIRED") break;
        }
      }
      if (!createdOk) {
        const code = lastErr?.response?.data?.code;
        if (code === "ITEM_TEMPLATE_DUPLICATE")
          return this.$message.error("名称重复");
        const msg =
          lastErr?.response?.data?.message ||
          lastErr?.response?.data?.error ||
          `创建失败 (${lastErr?.response?.status || "网络错误"})`;
        console.error(
          "item-templates create error:",
          lastErr?.response?.data || lastErr
        );
        return this.$message.error(msg);
      }
      const base = this.itemNameCache || [];
      const withoutDup = base.filter((v) => v !== desc);
      this.itemNameCache = [desc, ...withoutDup];
      if (this.addNewItemTargetRow) {
        this.addNewItemTargetRow.product_description = name;
        this.addNewItemTargetRow._nameLocked = true;
        if (this.newItemForm.price != null && this.newItemForm.price !== "") {
          const p = Number(this.newItemForm.price);
          if (!Number.isNaN(p)) this.addNewItemTargetRow.total_price = p;
        }
        this.markRowDirty(this.addNewItemTargetRow);
      }
      this.$message.success("已创建");
      this.addNewItemVisible = false;
      await this.loadItemSuggestions("");
    },
    // utils
    fmtWeight(kg) {
      if (kg == null || kg === "") return "-";
      const v = Number(kg);
      if (Number.isNaN(v)) return "-";
      return this.isImperial ? (v * 2.20462).toFixed(2) : v.toFixed(2);
    },
    fmtDim(cm) {
      if (cm == null || cm === "") return "-";
      const v = Number(cm);
      if (Number.isNaN(v)) return "-";
      return this.isImperial ? (v * 0.393701).toFixed(1) : v.toFixed(1);
    },
    toKg(lb) {
      if (lb == null || lb === "") return null;
      const v = Number(lb);
      if (Number.isNaN(v)) return null;
      return v * 0.45359237;
    },
    toCm(inch) {
      if (inch == null || inch === "") return null;
      const v = Number(inch);
      if (Number.isNaN(v)) return null;
      return v * 2.54;
    },
    close() {
      this.$emit("update:visible", false);
    },
    deleteItemRow(row, index) {
      this.itemsRows.splice(index, 1);
    },
    openImportFromTemplate() {
      /* placeholder: keep API surface */
    },
  },
};
</script>

<style scoped>
.editor-wrap {
  padding: 24px;
  background-color: #f4f6f9;
  height: calc(100% - 48px);
  display: flex;
  flex-direction: column;
}
.editor-head {
  padding: 16px;
  background-color: #fff;
  border-radius: 8px;
  margin-bottom: 16px;
}
.header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hdr-label {
  font-size: 18px;
  font-weight: 500;
  color: #333;
}
.code {
  font-size: 16px;
  font-weight: 700;
  color: #007bff;
}
.locked-name {
  color: #606266;
}
.ac-create {
  color: #67c23a;
}
.ac-item {
  color: #409eff;
}
.ac-disabled {
  color: #c0c4cc;
}
.ac-flag {
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}
</style>
