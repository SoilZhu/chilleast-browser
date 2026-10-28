<template>
  <div class="space-y-5">
    <!-- 页头 -->
    <PageHeader title="请假申请">
      <template #actions>
        <button class="md-btn-filled" @click="openApply">
          <Icon name="edit" size="sm" />
          发起请假
        </button>
        <button class="md-btn-outlined" :disabled="loading" @click="load">
          <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
          刷新
        </button>
      </template>
    </PageHeader>

    <!-- 状态筛选 -->
    <div class="md-tabs">
      <button
        v-for="tab in statusTabs"
        :key="tab.id"
        :class="activeStatus === tab.id ? 'md-tab-active' : 'md-tab'"
        @click="activeStatus = tab.id"
      >
        <span>{{ tab.label }}</span>
        <span class="md-tab-count">{{ countByStatus(tab.id) }}</span>
      </button>
    </div>

    <!-- 加载（落画布，不包卡片） -->
    <div v-if="loading && records.length === 0" class="md-rows">
      <div v-for="i in 3" :key="i" class="py-3.5 space-y-2">
        <div class="md-skeleton h-4 w-32" />
        <div class="md-skeleton h-3 w-full" />
        <div class="md-skeleton h-3 w-2/3" />
      </div>
    </div>

    <!-- 错误 -->
    <div v-else-if="errorMsg" class="flex flex-col items-center gap-3 py-10 text-center">
      <span
        class="w-12 h-12 rounded-full bg-md-danger-surface text-md-danger flex items-center justify-center"
      >
        <Icon name="error" size="lg" />
      </span>
      <p class="text-md2-body2 text-md-text-high">请假记录加载失败</p>
      <p class="text-md2-caption text-md-text-medium max-w-sm leading-relaxed">{{ errorMsg }}</p>
      <button class="md-btn-filled mt-1" @click="load">
        <Icon name="refresh" size="sm" />
        重试
      </button>
    </div>

    <!-- 空状态 -->
    <div v-else-if="filtered.length === 0" class="py-16 flex flex-col items-center gap-3">
      <span
        class="w-12 h-12 rounded-full bg-md-surface-2 flex items-center justify-center text-md-text-hint"
      >
        <Icon name="leave" size="lg" />
      </span>
      <p class="text-md2-body2 text-md-text-disabled">
        {{ records.length === 0 ? '还没有提交过请假申请' : '该状态下没有记录' }}
      </p>
    </div>

    <!-- 列表：一个分组，每条请假记录是一行 -->
    <NoteCard v-else :flush="true">
      <div class="md-feed-list">
      <article
        v-for="record in filtered"
        :key="record.id"
        class="md-feed-row flex-col items-stretch gap-2.5 py-3.5"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="md-chip-neutral">{{ record.typeName || '请假' }}</span>
              <span :class="leaveStatusChip(record)">{{ record.statusLabel }}</span>
              <span v-if="record.hasFile" class="md-chip-info">
                <Icon name="file" size="xs" />
                含附件
              </span>
            </div>
            <div class="mt-2 text-md2-subtitle2 text-md-text-high tabular-nums">
              {{ record.startTime }} ~ {{ record.endTime }}
            </div>
          </div>
          <span
            v-if="record.days > 0 || record.hours > 0"
            class="text-md2-caption text-md-text-medium shrink-0 tabular-nums"
          >
            共 {{ formatDuration(record.days, record.hours) }}
          </span>
        </div>

        <p
          v-if="record.reason"
          class="text-md2-body2 text-md-text-medium leading-relaxed line-clamp-3"
        >
          {{ record.reason }}
        </p>

        <div v-if="record.canDelete" class="flex items-center justify-end gap-2">
          <button
            class="md-btn-danger"
            :disabled="deletingId === record.id"
            @click="handleDelete(record)"
          >
            <Icon name="trash" size="sm" />
            {{ deletingId === record.id ? '撤销中…' : '撤销申请' }}
          </button>
        </div>
      </article>
      </div>
    </NoteCard>

    <!-- ============ 发起请假对话框 ============ -->
    <div
      v-if="showApply"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="closeApply"
    >
      <div class="md-dialog max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col">
        <div class="md-dialog-header shrink-0">
          <div class="flex items-start gap-3">
            <div
              class="w-10 h-10 rounded-full bg-brand-50 text-md-primary flex items-center justify-center shrink-0"
            >
              <Icon name="leave" size="sm" />
            </div>
            <div>
              <h3 class="md-dialog-title">发起请假申请</h3>
              <p class="text-md2-caption text-md-text-medium">
                提交后进入学院辅导员审核流程
              </p>
            </div>
          </div>
          <button class="md-icon-btn-sm -mt-1 -mr-1" @click="closeApply">
            <Icon name="close" size="sm" />
          </button>
        </div>

        <div class="md-dialog-body flex-1 overflow-y-auto no-scrollbar space-y-4">
          <!-- 类别 -->
          <div>
            <label class="md-label">请假类别</label>
            <div class="flex items-center gap-2">
              <button
                v-for="t in types"
                :key="t.id"
                :class="form.typeId === t.id ? 'md-chip-filter-active' : 'md-chip-filter'"
                @click="form.typeId = t.id"
              >
                {{ t.name }}
              </button>
              <span v-if="types.length === 0" class="text-md2-caption text-md-text-disabled">
                类别字典加载中…
              </span>
            </div>
          </div>

          <!-- 起止时间 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="md-label">开始时间</label>
              <input v-model="form.start" type="datetime-local" class="md-field" @change="recalc" />
            </div>
            <div>
              <label class="md-label">结束时间</label>
              <input v-model="form.end" type="datetime-local" class="md-field" @change="recalc" />
            </div>
          </div>

          <!-- 自动算出的时长（表单内的一行说明，不是卡片） -->
          <div
            v-if="durationLabel"
            class="flex items-center justify-between rounded-md2-md bg-md-surface-1 px-4 py-2.5 text-md2-body2"
          >
            <span class="text-md-text-medium">系统核算时长</span>
            <span class="font-mono text-md-primary tabular-nums">{{ durationLabel }}</span>
          </div>

          <!-- 事由 -->
          <div>
            <label class="md-label">请假事由</label>
            <textarea
              v-model="form.reason"
              rows="4"
              class="md-field resize-none"
              placeholder="请说明请假原因，病假建议附就诊证明"
            />
          </div>

          <!-- 附件 -->
          <div>
            <label class="md-label">证明材料（可选）</label>
            <div class="flex items-center gap-2">
              <label class="md-btn-outlined cursor-pointer">
                <Icon name="upload" size="sm" />
                选择文件
                <input type="file" class="hidden" accept="image/*,.pdf" @change="onFileChange" />
              </label>
              <span class="text-md2-caption text-md-text-medium truncate">
                {{ form.attachmentName || '未选择文件' }}
              </span>
              <button
                v-if="form.attachmentName"
                class="md-icon-btn-sm"
                title="移除附件"
                @click="clearFile"
              >
                <Icon name="close" size="sm" />
              </button>
            </div>
          </div>

          <!-- 错误 -->
          <Alert v-if="submitError" kind="error" :text="submitError" />
        </div>

        <div class="md-dialog-actions shrink-0 border-t border-md-card-border">
          <button class="md-btn-text" @click="closeApply">取消</button>
          <button class="md-btn-filled" :disabled="!canSubmit || submitting" @click="handleSubmit">
            <Icon name="refresh" v-if="submitting" size="sm" class="animate-spin" />
            {{ submitting ? '提交中…' : '提交申请' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import NoteCard from '../components/ui/NoteCard.vue';
import Alert from '../components/ui/Alert.vue';
import MetricGrid, { type MetricItem } from '../components/ui/MetricGrid.vue';
import {
  fetchLeaveList,
  fetchLeaveTypes,
  fetchLeaveDuration,
  submitLeave,
  deleteLeave,
  formatDuration,
  leaveStatusChip,
  type LeaveRecord,
  type LeaveDictItem,
} from '../api/xgxt';

const loading = ref(false);
const errorMsg = ref('');
const records = ref<LeaveRecord[]>([]);
const types = ref<LeaveDictItem[]>([]);
const activeStatus = ref('all');
const deletingId = ref('');

// ---------------------------------------------------------------------------
// 列表
// ---------------------------------------------------------------------------

const statusTabs = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待审核' },
  { id: 'auditing', label: '审核中' },
  { id: 'done', label: '已审核' },
];

function matchStatus(record: LeaveRecord, status: string): boolean {
  if (status === 'all') return true;
  if (status === 'pending') return record.auditStatus === '0';
  if (status === 'auditing') return record.auditStatus === '8';
  if (status === 'done') return record.auditStatus === '9';
  return true;
}

const filtered = computed(() => records.value.filter((r) => matchStatus(r, activeStatus.value)));

function countByStatus(status: string): number {
  return records.value.filter((r) => matchStatus(r, status)).length;
}

const stats = computed(() => [
  { label: '申请总数', value: records.value.length },
  { label: '待审核', value: countByStatus('pending') },
  { label: '审核中', value: countByStatus('auditing') },
  { label: '已审核', value: countByStatus('done') },
]);

/** 统计指标组（原来的 4 张统计卡 → 一组指标，竖线分隔、无外框） */
const statMetrics = computed<MetricItem[]>(() =>
  stats.value.map((s) => ({ label: s.label, value: s.value })),
);

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    records.value = await fetchLeaveList();
  } catch (err: any) {
    errorMsg.value = err?.message || '请检查网络或登录状态';
  } finally {
    loading.value = false;
  }
}

async function loadTypes() {
  try {
    types.value = await fetchLeaveTypes();
  } catch {
    /* 类别加载失败不阻断列表 */
  }
}

// ---------------------------------------------------------------------------
// 发起请假
// ---------------------------------------------------------------------------

const showApply = ref(false);
const submitting = ref(false);
const submitError = ref('');
const durationLabel = ref('');

const form = ref({
  typeId: '',
  start: '',
  end: '',
  reason: '',
  attachmentName: '',
  attachmentBase64: '',
  attachmentType: '',
});

function defaultStart(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return toLocalInput(now);
}

function defaultEnd(): string {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d);
}

/** Date → `yyyy-MM-ddTHH:mm`（datetime-local 要求的格式） */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** `yyyy-MM-ddTHH:mm` → `yyyy-MM-dd HH:mm`（学工接口要求） */
function toApiTime(value: string): string {
  return value.replace('T', ' ');
}

function openApply() {
  submitError.value = '';
  durationLabel.value = '';
  form.value = {
    typeId: types.value[0]?.id ?? '01',
    start: defaultStart(),
    end: defaultEnd(),
    reason: '',
    attachmentName: '',
    attachmentBase64: '',
    attachmentType: '',
  };
  showApply.value = true;
  if (types.value.length === 0) loadTypes();
  recalc();
}

function closeApply() {
  showApply.value = false;
}

const canSubmit = computed(
  () => form.value.start !== '' && form.value.end !== '' && form.value.reason.trim().length >= 2,
);

let recalcTimer: ReturnType<typeof setTimeout> | null = null;

function recalc() {
  if (recalcTimer) clearTimeout(recalcTimer);
  recalcTimer = setTimeout(async () => {
    if (form.value.start === '' || form.value.end === '') {
      durationLabel.value = '';
      return;
    }
    try {
      const d = await fetchLeaveDuration(toApiTime(form.value.start), toApiTime(form.value.end));
      durationLabel.value = formatDuration(d.days, d.hours) || '0小时';
    } catch {
      durationLabel.value = '';
    }
  }, 400);
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    submitError.value = '附件不能超过 8MB';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result as string;
    form.value.attachmentBase64 = result;
    form.value.attachmentName = file.name;
    form.value.attachmentType = file.type || 'application/octet-stream';
  };
  reader.onerror = () => {
    submitError.value = '附件读取失败';
  };
  reader.readAsDataURL(file);
}

function clearFile() {
  form.value.attachmentName = '';
  form.value.attachmentBase64 = '';
  form.value.attachmentType = '';
}

async function handleSubmit() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  submitError.value = '';

  try {
    // 字段名与 Dart `LeaveService.submit` 的 fields 约定保持一致
    const start = toApiTime(form.value.start);
    const end = toApiTime(form.value.end);
    const fields: Record<string, string> = {
      'qjlxM.dm': form.value.typeId,
      qjlx: form.value.typeId,
      kssj: start,
      jssj: end,
      qjsy: form.value.reason.trim(),
      lxr: '',
      lxrdh: '',
      lxMdd: '',
      qjLocation: '',
      qjLocationZb: '',
      operationType: '',
      id: '',
    };

    await submitLeave(
      fields,
      form.value.attachmentBase64
        ? {
            filename: form.value.attachmentName,
            contentBase64: form.value.attachmentBase64,
            contentType: form.value.attachmentType,
          }
        : undefined,
    );

    showApply.value = false;
    await load();
  } catch (err: any) {
    submitError.value = err?.message || '提交失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

// ---------------------------------------------------------------------------
// 撤销
// ---------------------------------------------------------------------------

async function handleDelete(record: LeaveRecord) {
  if (!window.confirm(`确认撤销这条${record.typeName || '请假'}申请？`)) return;
  deletingId.value = record.id;
  try {
    await deleteLeave(record.id);
    await load();
  } catch (err: any) {
    window.alert(err?.message || '撤销失败');
  } finally {
    deletingId.value = '';
  }
}

onMounted(() => {
  load();
  loadTypes();
});
</script>
