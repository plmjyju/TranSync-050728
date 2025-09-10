<template>
  <div class="page-wrap">
    <el-card class="full-card">
      <!-- 状态 Tabs 作为上级容器，每个 Tab 内可放置独立的 toolbar/table -->
      <el-tabs
        v-model="activeStatus"
        class="status-tabs"
        @tab-click="onStatusChange"
      >
        <!-- 全部 -->
        <el-tab-pane label="全部" name="all">
          <div class="toolbar">
            <el-input
              v-model="q"
              placeholder="搜索备注/编号（全部）"
              clearable
              @keyup.enter.native="load"
              style="width: 260px; margin-right: 8px"
            />
            <el-select
              v-model="status"
              placeholder="状态"
              clearable
              style="width: 200px; margin-right: 8px"
            >
              <el-option label="草稿" value="draft" />
              <el-option label="已提交" value="submitted" />
              <el-option label="仓库处理中" value="warehouse_processing" />
              <el-option label="已入库" value="checked_in" />
              <el-option label="异常" value="exception" />
            </el-select>
            <el-button type="primary" @click="load">查询</el-button>
          </div>

          <el-card
            class="section-card"
            shadow="never"
            :key="'all'"
            :style="autoHeight ? { minHeight: sectionMinH + 'px' } : null"
          >
            <div class="ops-bar">
              <el-button
                type="primary"
                v-permission="['client.inbond.create']"
                @click="goCreateInbond"
                >新建入库单</el-button
              >
            </div>
            <div
              class="table-wrap"
              :style="autoHeight ? { minHeight: tableMinH + 'px' } : null"
            >
              <el-table
                :data="rows"
                height="100%"
                v-loading="loading"
                :header-cell-style="{ background: '#f8f9fa' }"
                @row-dblclick="onRowDblClick"
              >
                <el-table-column
                  prop="inbond_code"
                  label="入库单号"
                  width="180"
                />
                <el-table-column
                  prop="arrival_method"
                  label="到仓方式"
                  width="140"
                />
                <el-table-column prop="status" label="状态" width="140" />
                <el-table-column
                  prop="total_packages"
                  label="总包裹数"
                  width="120"
                />
                <el-table-column
                  prop="arrived_packages"
                  label="到仓包裹数"
                  width="120"
                />
                <el-table-column
                  prop="clearance_type"
                  label="报关类型"
                  width="140"
                />
                <el-table-column
                  prop="last_arrival_at"
                  label="最后到达日期"
                  width="200"
                />
                <el-table-column
                  prop="last_scan_at"
                  label="最后扫描时间"
                  width="200"
                />
                <el-table-column prop="remark" label="备注" min-width="220" />
                <!-- 新增 操作列 -->
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      type="primary"
                      link
                      size="small"
                      @click="openEditorFor(row)"
                      >编辑</el-button
                    >
                  </template>
                </el-table-column>
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
            </div>
          </el-card>
        </el-tab-pane>

        <!-- 草稿 -->
        <el-tab-pane label="草稿" name="draft">
          <div class="toolbar">
            <el-input
              v-model="q"
              placeholder="搜索备注/编号（草稿）"
              clearable
              @keyup.enter.native="load"
              style="width: 260px; margin-right: 8px"
            />
            <el-button type="primary" @click="load">查询</el-button>
          </div>
          <div class="ops-bar">
            <el-button
              type="primary"
              v-permission="['client.inbond.create']"
              @click="goCreateInbond"
              >新建入库单</el-button
            >
          </div>
          <el-card
            class="section-card"
            shadow="never"
            :key="'draft'"
            :style="
              autoHeight
                ? {
                    minHeight: sectionMinH + 'px',
                    height: computedSectionHeight + 'px',
                  }
                : null
            "
          >
            <div
              class="table-wrap"
              :style="autoHeight ? { minHeight: tableMinH + 'px' } : null"
            >
              <el-table
                :data="rows"
                height="100%"
                v-loading="loading"
                :header-cell-style="{ background: '#f8f9fa' }"
                @row-dblclick="onRowDblClick"
              >
                <el-table-column
                  prop="inbond_code"
                  label="入库单号"
                  width="180"
                />
                <el-table-column prop="remark" label="备注" min-width="220" />
                <el-table-column
                  prop="created_at"
                  label="创建时间"
                  width="200"
                />
                <!-- 新增 操作列 -->
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      type="primary"
                      link
                      size="small"
                      @click="openEditorFor(row)"
                      >编辑</el-button
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
        </el-tab-pane>

        <!-- 已提交 -->
        <el-tab-pane label="已提交" name="submitted">
          <div class="toolbar">
            <el-input
              v-model="q"
              placeholder="搜索备注/编号（已提交）"
              clearable
              @keyup.enter.native="load"
              style="width: 260px; margin-right: 8px"
            />
            <el-button type="primary" @click="load">查询</el-button>
          </div>
          <div class="ops-bar">
            <!-- 可选：不同操作按钮组合，这里暂与其它相同 -->
            <el-button
              type="primary"
              v-permission="['client.inbond.create']"
              @click="goCreateInbond"
              >新建入库单</el-button
            >
          </div>
          <el-card
            class="section-card"
            shadow="never"
            :key="'submitted'"
            :style="
              autoHeight
                ? {
                    minHeight: sectionMinH + 'px',
                    height: computedSectionHeight + 'px',
                  }
                : null
            "
          >
            <div
              class="table-wrap"
              :style="autoHeight ? { minHeight: tableMinH + 'px' } : null"
            >
              <el-table
                :data="rows"
                :height="computedTableHeight"
                v-loading="loading"
                :header-cell-style="{ background: '#f8f9fa' }"
                @row-dblclick="onRowDblClick"
              >
                <el-table-column
                  prop="inbond_code"
                  label="入库单号"
                  width="180"
                />
                <el-table-column
                  prop="arrival_method"
                  label="到仓方式"
                  width="140"
                />
                <el-table-column
                  prop="clearance_type"
                  label="报关类型"
                  width="140"
                />
                <el-table-column
                  prop="total_packages"
                  label="总包裹数"
                  width="120"
                />
                <el-table-column
                  prop="arrived_packages"
                  label="到仓包裹数"
                  width="120"
                />
                <el-table-column
                  prop="last_arrival_at"
                  label="最后到达日期"
                  width="200"
                />
                <el-table-column
                  prop="last_scan_at"
                  label="最后扫描时间"
                  width="200"
                />
                <!-- 新增 操作列 -->
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      type="primary"
                      link
                      size="small"
                      @click="openEditorFor(row)"
                      >编辑</el-button
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
        </el-tab-pane>

        <!-- 仓库处理中 -->
        <el-tab-pane label="仓库处理中" name="warehouse_processing">
          <div class="toolbar">
            <el-input
              v-model="q"
              placeholder="搜索备注/编号（仓库处理中）"
              clearable
              @keyup.enter.native="load"
              style="width: 260px; margin-right: 8px"
            />
            <el-button type="primary" @click="load">查询</el-button>
          </div>
          <div class="ops-bar">
            <el-button
              type="primary"
              v-permission="['client.inbond.create']"
              @click="goCreateInbond"
              >新建入库单</el-button
            >
          </div>
          <el-card
            class="section-card"
            shadow="never"
            :key="'warehouse_processing'"
            :style="
              autoHeight
                ? {
                    minHeight: sectionMinH + 'px',
                    height: computedSectionHeight + 'px',
                  }
                : null
            "
          >
            <div
              class="table-wrap"
              :style="autoHeight ? { minHeight: tableMinH + 'px' } : null"
            >
              <el-table
                :data="rows"
                :height="computedTableHeight"
                v-loading="loading"
                :header-cell-style="{ background: '#f8f9fa' }"
                @row-dblclick="onRowDblClick"
              >
                <el-table-column
                  prop="inbond_code"
                  label="入库单号"
                  width="180"
                />
                <el-table-column
                  prop="arrival_method"
                  label="到仓方式"
                  width="140"
                />
                <el-table-column
                  prop="total_packages"
                  label="总包裹数"
                  width="120"
                />
                <el-table-column
                  prop="arrived_packages"
                  label="到仓包裹数"
                  width="120"
                />
                <el-table-column
                  prop="last_arrival_at"
                  label="最后到达日期"
                  width="200"
                />
                <el-table-column
                  prop="last_scan_at"
                  label="最后扫描时间"
                  width="200"
                />
                <!-- 新增 操作列 -->
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      type="primary"
                      link
                      size="small"
                      @click="openEditorFor(row)"
                      >编辑</el-button
                    >
                  </template>
                </el-table-column>
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
            </div>
          </el-card>
        </el-tab-pane>

        <!-- 已入库 -->
        <el-tab-pane label="已入库" name="checked_in">
          <div class="toolbar">
            <el-input
              v-model="q"
              placeholder="搜索备注/编号（已入库）"
              clearable
              @keyup.enter.native="load"
              style="width: 260px; margin-right: 8px"
            />
            <el-button type="primary" @click="load">查询</el-button>
          </div>
          <div class="ops-bar">
            <el-button
              type="primary"
              v-permission="['client.inbond.create']"
              @click="goCreateInbond"
              >新建入库单</el-button
            >
          </div>
          <el-card
            class="section-card"
            shadow="never"
            :key="'checked_in'"
            :style="
              autoHeight
                ? {
                    minHeight: sectionMinH + 'px',
                    height: computedSectionHeight + 'px',
                  }
                : null
            "
          >
            <div
              class="table-wrap"
              :style="autoHeight ? { minHeight: tableMinH + 'px' } : null"
            >
              <el-table
                :data="rows"
                :height="computedTableHeight"
                v-loading="loading"
                :header-cell-style="{ background: '#f8f9fa' }"
                @row-dblclick="onRowDblClick"
              >
                <el-table-column
                  prop="inbond_code"
                  label="入库单号"
                  width="180"
                />
                <el-table-column
                  prop="arrival_method"
                  label="到仓方式"
                  width="140"
                />
                <el-table-column
                  prop="clearance_type"
                  label="报关类型"
                  width="140"
                />
                <el-table-column
                  prop="total_packages"
                  label="总包裹数"
                  width="120"
                />
                <el-table-column
                  prop="arrived_packages"
                  label="到仓包裹数"
                  width="120"
                />
                <el-table-column
                  prop="last_arrival_at"
                  label="最后到达日期"
                  width="200"
                />
                <el-table-column
                  prop="last_scan_at"
                  label="最后扫描时间"
                  width="200"
                />
                <!-- 新增 操作列 -->
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      type="primary"
                      link
                      size="small"
                      @click="openEditorFor(row)"
                      >编辑</el-button
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
        </el-tab-pane>

        <!-- 异常 -->
        <el-tab-pane label="异常" name="exception">
          <div class="toolbar">
            <el-input
              v-model="q"
              placeholder="搜索备注/编号（异常）"
              clearable
              @keyup.enter.native="load"
              style="width: 260px; margin-right: 8px"
            />
            <el-button type="primary" @click="load">查询</el-button>
          </div>
          <div class="ops-bar">
            <el-button
              type="primary"
              v-permission="['client.inbond.create']"
              @click="goCreateInbond"
              >新建入库单</el-button
            >
          </div>
          <el-card
            class="section-card"
            shadow="never"
            :key="'exception'"
            :style="
              autoHeight
                ? {
                    minHeight: sectionMinH + 'px',
                    height: computedSectionHeight + 'px',
                  }
                : null
            "
          >
            <div
              class="table-wrap"
              :style="autoHeight ? { minHeight: tableMinH + 'px' } : null"
            >
              <el-table
                :data="rows"
                :height="computedTableHeight"
                v-loading="loading"
                :header-cell-style="{ background: '#f8f9fa' }"
                @row-dblclick="onRowDblClick"
              >
                <el-table-column
                  prop="inbond_code"
                  label="入库单号"
                  width="180"
                />
                <el-table-column prop="status" label="状态" width="140" />
                <el-table-column prop="remark" label="备注" min-width="220" />
                <el-table-column
                  prop="created_at"
                  label="创建时间"
                  width="200"
                />
                <!-- 新增 操作列 -->
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      type="primary"
                      link
                      size="small"
                      @click="openEditorFor(row)"
                      >编辑</el-button
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
        </el-tab-pane>
      </el-tabs>

      <!-- 入库单编辑 Drawer（单页完成：基本信息 -> 新增包裹 -> 包裹明细） -->
      <el-drawer v-model="inbondEditorVisible" size="80%" :with-header="false">
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
                <el-button @click="inbondEditorVisible = false">关闭</el-button>
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
                      <el-option
                        label="保税仓(兼容)"
                        value="bonded_warehouse"
                      />
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
                    <el-radio-button label="metric"
                      >公制(cm/kg)</el-radio-button
                    >
                    <el-radio-button label="imperial"
                      >英制(in/lb)</el-radio-button
                    >
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
                    >
                      {{ itemCountMap[row.package_code] ?? "-" }}
                    </el-link>
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
                          <span v-if="item.disabled" class="ac-flag"
                            >（已选）</span
                          >
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
                        <el-button type="danger" link size="small"
                          >删</el-button
                        >
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
                  <el-radio-button label="imperial"
                    >英制(in/lb)</el-radio-button
                  >
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
    </el-card>
  </div>
</template>

<script>
import http from "../api/http";

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
      activeStatus: "all",
      inbondEditorVisible: false,
      currentInbondId: "",
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
      // editor packages
      pkgRows: [],
      pkgLoading: false,
      itemCountMap: {},
      // create package dialog
      createVisible: false,
      savingPkg: false,
      createForm: { operation_requirement_code: "", weight_kg: 0, remark: "" },
      allowedRequirements: [],
      // 当前正在编辑明细的包裹
      currentPackage: null,
      // 明细表格编辑
      itemsVisible: false,
      itemsLoading: false,
      itemsRows: [],
      savingItems: false,
      // 联想缓存（前端本地筛选）
      itemNameCache: [],
      // 新物品弹窗
      addNewItemVisible: false,
      addNewItemTargetRow: null, // 当前从联想触发创建的新物品要回填的行
      newItemUnitMode: "metric", // 新物品弹窗内单位切换
      newItemForm: {
        product_name: "",
        product_description: "",
        material: "",
        origin_country: "",
        hs_code: "",
        // 仅前端使用的尺寸/重量/价格（用于回填与模板参考）
        length: null,
        width: null,
        height: null,
        weight: null,
        price: null,
      },
      autoHeight: true,
      sectionMinH: 0,
      tableMinH: 0,
      sectionPadTop: 0,
      sectionPadBottom: 0,
      pagerBlockH: 0,
    };
  },
  computed: {
    // 草稿态可编辑/新增
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
    computedTableHeight() {
      // 默认期望高度 ~920px；实际高度在 [360, 920] 之间取值，保证表头固定、表体滚动
      if (!this.autoHeight) return 920;
      const h = Number(this.tableMinH) || 0;
      if (!h) return 920;
      return Math.max(360, Math.min(920, Math.floor(h)));
    },
    computedSectionHeight() {
      // 用表格高度 + 内边距 + 分页器高度，得到卡片的精确总高度
      if (!this.autoHeight) return 920;
      const t = Number(this.tableMinH) || 0;
      if (!t) return 920;
      const total =
        t +
        (this.sectionPadTop || 0) +
        (this.sectionPadBottom || 0) +
        (this.pagerBlockH || 0);
      return Math.max(380, Math.floor(total));
    },
  },
  created() {
    const tab = this.$route?.query?.statusTab;
    if (tab) this.activeStatus = String(tab);
    this.syncStatusAndLoad();
  },
  mounted() {
    // 初次计算高度并绑定窗口变化事件
    this.$nextTick(() => this.computeAutoHeights());
    window.addEventListener("resize", this.handleResize, { passive: true });
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.handleResize);
  },
  watch: {
    "$route.query.statusTab"() {
      const tab = this.$route?.query?.statusTab;
      if (tab) this.activeStatus = String(tab);
      this.syncStatusAndLoad();
      this.$nextTick(() => this.computeAutoHeights());
    },
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
        this.total = data?.pagination?.total || data.total || data.count || 0;
      } catch (e) {
        const msg = e?.response?.data?.message || "加载失败";
        this.$notify?.error?.({ title: "错误", message: msg });
      } finally {
        this.loading = false;
        // 数据变化后重算高度，避免分页或空态造成跳变
        this.$nextTick(() => this.computeAutoHeights());
      }
    },
    onStatusChange() {
      const map = {
        all: "",
        draft: "draft",
        submitted: "submitted",
        warehouse_processing: "warehouse_processing",
        checked_in: "checked_in",
        exception: "exception",
      };
      this.status = map[this.activeStatus] ?? "";
      this.page = 1;
      this.load();
      const q = { ...this.$route.query, statusTab: this.activeStatus };
      this.$router.replace({ path: this.$route.path, query: q });
      this.$nextTick(() => this.computeAutoHeights());
    },
    syncStatusAndLoad() {
      const map = {
        all: "",
        draft: "draft",
        submitted: "submitted",
        warehouse_processing: "warehouse_processing",
        checked_in: "checked_in",
        exception: "",
      };
      this.status = map[this.activeStatus] ?? "";
      this.page = 1;
      this.load();
    },
    // 改造：创建并打开同页编辑器
    async goCreateInbond() {
      try {
        const { data } = await http.post("/api/client/create-inbond", {
          shipping_type: "air",
          clearance_type: "T01",
          arrival_method: "",
          remark: "",
        });
        const id = data?.inbond?.id || data?.id;
        if (!id) throw new Error("未获取到入库单ID");
        this.currentInbondId = String(id);
        this.inbondEditorVisible = true;
        await this.refreshEditor();
        this.$message.success("已创建草稿入库单");
      } catch (e) {
        const msg = e?.response?.data?.message || e.message || "创建失败";
        this.$message.error(msg);
      }
    },
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
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "加载入库单失败");
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
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "保存失败");
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
        // 刷新列表
        await this.load();
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "提交失败");
      } finally {
        this.submitting = false;
      }
    },
    onRowDblClick(row) {
      this.openEditorFor(row);
    },
    openEditorFor(row) {
      const id = row?.id || row?.inbond_id || row?.inbondId;
      if (!id) return;
      this.currentInbondId = String(id);
      this.inbondEditorVisible = true;
      this.refreshEditor();
    },

    // 新增：包裹表格的双击事件，打开当前包裹的明细编辑（新包裹草稿不处理）
    onPkgRowDblClick(row) {
      if (!row || row.isNew) return;
      this.openItemsEditor(row);
    },

    fmtWeight(kg) {
      if (kg === null || kg === undefined || kg === "") return "-";
      const v = Number(kg);
      if (Number.isNaN(v)) return "-";
      return this.isImperial ? (v * 2.20462).toFixed(2) : v.toFixed(2);
    },
    fmtDim(cm) {
      if (cm === null || cm === undefined || cm === "") return "-";
      const v = Number(cm);
      if (Number.isNaN(v)) return "-";
      return this.isImperial ? (v * 0.393701).toFixed(1) : v.toFixed(1);
    },
    toKg(lb) {
      if (lb === null || lb === undefined || lb === "") return null;
      const v = Number(lb);
      if (Number.isNaN(v)) return null;
      return v * 0.45359237;
    },
    toCm(inch) {
      if (inch === null || inch === undefined || inch === "") return null;
      const v = Number(inch);
      if (Number.isNaN(v)) return null;
      return v * 2.54;
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
        // 并行加载条目数量
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
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "加载包裹失败");
      } finally {
        this.pkgLoading = false;
      }
    },
    async ensureAllowedRequirements() {
      if (this.allowedRequirements && this.allowedRequirements.length) return;
      try {
        const { data } = await http.get(
          "/api/common/operation-requirements/user-allowed"
        );
        this.allowedRequirements = data?.requirements || [];
      } catch {
        this.$message.error("加载可选操作需求失败");
      }
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
        // 维度转换（in -> cm 或直接 cm），仅在有值时附加
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
          if (idx >= 0)
            this.$set
              ? this.$set(this.pkgRows, idx, created)
              : (this.pkgRows[idx] = created);
          this.itemCountMap[created.package_code] = 0;
        } else {
          await this.loadInbondPackages();
        }
        this.$message.success("创建成功，请继续添加明细");
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "创建失败");
      } finally {
        row._saving = false;
      }
    },
    cancelInlinePackage(row) {
      const idx = this.pkgRows.indexOf(row);
      if (idx >= 0) this.pkgRows.splice(idx, 1);
    },
    async openCreatePkg() {
      try {
        const { data } = await http.get(
          "/api/common/operation-requirements/user-allowed"
        );
        this.allowedRequirements = data?.requirements || [];
        this.createForm = {
          operation_requirement_code: "",
          weight_kg: 0,
          remark: "",
        };
        this.createVisible = true;
      } catch {
        this.$message.error("加载可选操作需求失败");
      }
    },
    async submitCreatePkg() {
      if (!this.currentInbondId) return;
      if (!this.createForm.operation_requirement_code)
        return this.$message.warning("请选择操作需求");
      this.savingPkg = true;
      try {
        await http.post(
          `/api/client/inbond/${this.currentInbondId}/add-package`,
          {
            operation_requirement_code:
              this.createForm.operation_requirement_code,
            weight_kg: this.createForm.weight_kg,
            remark: this.createForm.remark,
          }
        );
        this.$message.success("创建成功，请继续添加明细");
        this.createVisible = false;
        await this.loadInbondPackages();
      } catch (e) {
        const msg = e?.response?.data?.message || "创建失败";
        this.$message.error(msg);
      } finally {
        this.savingPkg = false;
      }
    },
    async openItemsEditor(row) {
      this.currentPackage = row;
      this.itemsVisible = true;
      await Promise.all([this.loadItemsOf(row), this.loadItemSuggestions("")]);
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
          _nameLocked: !!it.id, // 已有明细默认锁定名称
          _rowLocked: !!it.id, // 已有明细默认整行锁定
        }));
        this.itemsRows = list;
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "加载明细失败");
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
      row._nameLocked = false; // 允许编辑名称
    },
    makeQueryItemNameSuggestions(row) {
      return (queryString, cb) =>
        this.queryItemNameSuggestionsWithRow(row, queryString, cb);
    },
    queryItemNameSuggestionsWithRow(row, queryString, cb) {
      const kw = (queryString || "").trim();
      const base = this.itemNameCache || [];
      // 统计本明细已使用的名称（排除当前行的现有值）
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
        row._nameLocked = true; // 选中后锁定名称
        this.markRowDirty(row);
      }
    },
    onItemNameBlur(row) {
      const val = (row.product_description || "").trim();
      if (!val) return;
      // 如果是已存在于全局联想列表，默认也锁定
      if (
        Array.isArray(this.itemNameCache) &&
        this.itemNameCache.includes(val)
      ) {
        row._nameLocked = true;
      }
    },

    // 新增：标记行已编辑，供保存按钮和批量锁定使用
    markRowDirty(row) {
      if (row && typeof row === "object") {
        row._dirty = true;
      }
    },

    // 新增：行校验——至少需要非空名称；数量/总价允许为空（后端将按 null 处理）
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
        row._rowLocked = true; // 保存后整行锁定
        this.$message.success("已保存");
        // 不自动刷新，保留锁定状态
      } catch (e) {
        this.$message.error(e?.response?.data?.message || "保存失败");
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
        // 批量保存成功：锁定所有有效行
        this.itemsRows.forEach((r) => {
          if (this.isRowValid(r)) r._rowLocked = true;
        });
        this.$message.success("保存成功");
      } catch (e) {
        const msg =
          e?.response?.data?.message || e?.response?.data?.error || "保存失败";
        if (e?.response?.data?.errors?.length) {
          console.warn("验证失败: ", e.response.data.errors);
        }
        this.$message.error(msg);
      } finally {
        this.savingItems = false;
      }
    },
    // 本地联想：首次打开时拉取一次列表，后续在前端过滤
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
        // 去重
        this.itemNameCache = Array.from(new Set(list));
      } catch (e) {
        // 静默失败即可
        console.debug("loadItemSuggestions error", e?.message);
      }
    },
    queryItemNameSuggestions(queryString, cb) {
      const kw = (queryString || "").trim();
      const base = this.itemNameCache || [];
      const filtered = kw ? base.filter((v) => v.includes(kw)) : base;
      const list = [];
      if (kw) {
        list.push({ value: `＋ 新物品：${kw}`, __create: true, keyword: kw });
      }
      list.push(...filtered.map((v) => ({ value: v })));
      cb(list);
    },
    onItemNameSelect(row, item) {
      // 选择下拉项：首行“新物品”则打开弹窗并预填关键词
      if (item && item.__create) {
        this.openAddNewItemDialog(item.keyword, row);
        // 将输入框内容设置为关键词（未真正创建前不锁定）
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
        row._nameLocked = true; // 选中联想项后锁定名称
        this.markRowDirty(row);
      }
    },
    onItemNameBlur(row) {
      const val = (row.product_description || "").trim();
      if (!val) return;
      // 若用户未选择下拉但直接输入了一个已存在的名称，也进行锁定
      if (
        Array.isArray(this.itemNameCache) &&
        this.itemNameCache.includes(val)
      ) {
        row._nameLocked = true;
      }
    },

    // 新增：打开“新物品”弹窗，支持从联想带入关键字并记录回填目标行
    openAddNewItemDialog(keyword = "", targetRow = null) {
      this.addNewItemTargetRow = targetRow;
      // 预填名称/描述，用户可继续修改
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

      let createdOk = false;
      let lastErr;
      for (const body of bodies) {
        try {
          console.debug("POST /item-templates payload:", body);
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
        if (code === "ITEM_TEMPLATE_DUPLICATE") {
          return this.$message.error("名称重复");
        }
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

      // 本地联想置顶
      const base = this.itemNameCache || [];
      const withoutDup = base.filter((v) => v !== desc);
      this.itemNameCache = [desc, ...withoutDup];

      // 回填当前编辑行：名称与价格，并锁定名称
      if (this.addNewItemTargetRow) {
        this.addNewItemTargetRow.product_description = name;
        this.addNewItemTargetRow._nameLocked = true; // 创建新物品后锁定名称
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
    handleResize() {
      this.computeAutoHeights();
    },
  },
};
</script>

<style scoped>
.page-wrap {
  background-color: #f4f6f9;
  box-sizing: border-box;
  /* 还原为普通文档流，避免过度 flex 影响内部控件布局 */
  display: block;
  height: 100vh;
}

.full-card {
  background-color: #fff;

  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  --el-card-padding: 0px;
  /* 改为最小高度，避免固定高度造成内部滚动/压缩 */
}

.status-tabs {
  margin-bottom: 0px;
  /* 移除先前的 flex 设置 */
}

/* 移除对 Element Plus Tabs 的 :deep 覆盖，避免布局错乱 */
/* :deep(.el-tabs), :deep(.el-tabs__content), :deep(.el-tab-pane) 均不再强制 flex */

.toolbar {
  display: flex;
  align-items: center;

  padding: 16px;
}

.ops-bar {
  margin-bottom: 16px;
  padding-left: 16px;
  padding-right: 16px;
}

/* 改为最小高度保证“即使没数据也沾满屏幕” */
.section-card {
  background-color: #f8f9fa;

  margin-bottom: 16px;
  --el-card-padding: 0px;
  --el-card-border-radius: 0px;
  padding-top: 16px;
}

.table-wrap {
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
  margin-left: 16px;
  margin-right: 16px;
  border-radius: 8 8 0 0;
  border: 1px solid #f1f1f1;
}

.pager {
  text-align: left;
  margin-top: 8px;
  padding-left: 16px;
  padding-right: 16px;
  margin-bottom: 8px;
}

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
.locked-name {
  color: #606266;
}

/* 统一设置 Tabs 标签样式：字号16px，左右内边距16px，总高度48px，文字垂直居中 */
.status-tabs :deep(.el-tabs__item) {
  font-size: 16px;
  padding: 0 16px;
  height: 48px;
  line-height: 48px;
  font-weight: 0;
}

/* 保证导航区域整体高度为48px，避免出现额外空白 */
.status-tabs :deep(.el-tabs__nav-wrap) {
  height: 48px;
}

/* 压缩 header 与内容间距，防止高度叠加造成视觉偏高 */
.status-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

/* 强化选择器并使用 !important 覆盖 EP 默认 0 20px 的内边距 */
.status-tabs :deep(.el-tabs__header .el-tabs__nav .el-tabs__item) {
  padding-left: 16px !important;
  padding-right: 16px !important;
}
</style>
