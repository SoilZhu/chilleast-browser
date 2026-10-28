<template>
  <div class="space-y-5">
    <!-- 页头 -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-md2-h6 text-md-text-high">
          {{ detail ? '填写问卷' : '学工问卷' }}
        </h1>
        <p v-if="detail" class="text-md2-body2 text-md-text-medium mt-0.5">
          {{ detail.title }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button v-if="detail" class="md-btn-outlined" @click="backToList">
          <Icon name="arrow-left" size="sm" />
          返回列表
        </button>
        <button v-else class="md-btn-outlined" :disabled="loading" @click="loadList">
          <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
          刷新
        </button>
      </div>
    </div>

    <!-- ==================== 列表视图 ==================== -->
    <template v-if="!detail">
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

      <!-- 加载 -->
      <div v-if="loading && list.length === 0" class="space-y-3">
        <div v-for="i in 3" :key="i" class="space-y-2 py-2">
          <div class="md-skeleton h-4 w-2/3" />
          <div class="md-skeleton h-3 w-1/2" />
        </div>
      </div>

      <!-- 错误 -->
      <div v-else-if="errorMsg" class="flex flex-col items-center gap-3 py-10 text-center">
        <span
          class="w-12 h-12 rounded-full bg-md-danger-surface text-md-danger flex items-center justify-center"
        >
          <Icon name="error" size="lg" />
        </span>
        <p class="text-md2-body2 text-md-text-high">问卷列表加载失败</p>
        <p class="text-md2-caption text-md-text-medium max-w-sm leading-relaxed">{{ errorMsg }}</p>
        <button class="md-btn-filled mt-1" @click="loadList">
          <Icon name="refresh" size="sm" />
          重试
        </button>
      </div>

      <!-- 空 -->
      <div v-else-if="filtered.length === 0" class="py-16 flex flex-col items-center gap-3">
        <span
          class="w-12 h-12 rounded-full bg-md-surface-2 flex items-center justify-center text-md-text-hint"
        >
          <Icon name="questionnaire" size="lg" />
        </span>
        <p class="text-md2-body2 text-md-text-disabled">
          {{ list.length === 0 ? '暂无可填写的问卷' : '该状态下没有问卷' }}
        </p>
      </div>

      <!-- 列表：一个分组，每条问卷是一行 -->
      <NoteCard v-else title="问卷列表" :meta="`${filtered.length} 份`" :flush="true">
      <div class="md-feed-list">
        <button
          v-for="item in filtered"
          :key="item.dm"
          class="md-feed-row items-start py-4 hover:bg-white"
          @click="openDetail(item)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-3">
              <h3 class="text-md2-subtitle2 text-md-text-high leading-snug line-clamp-2">
                {{ item.title }}
              </h3>
              <span :class="questionnaireStatusChip(item)" class="shrink-0 mt-0.5">
                {{ item.statusLabel }}
              </span>
            </div>
            <div class="text-md2-caption text-md-text-medium mt-1.5 tabular-nums">
              截止 {{ dateOnly(item.endTime) || '不限' }}
            </div>
          </div>

          <Icon name="chevron-right" size="sm" class="text-md-text-hint shrink-0 mt-2" />
        </button>
      </div>
      </NoteCard>
    </template>

    <!-- ==================== 答题视图 ==================== -->
    <template v-else>
      <!-- 加载（落画布，不包卡片） -->
      <div v-if="detailLoading" class="md-rows">
        <div v-for="i in 4" :key="i" class="py-3.5 space-y-2">
          <div class="md-skeleton h-4 w-3/4" />
          <div class="md-skeleton h-3 w-full" />
          <div class="md-skeleton h-3 w-1/2" />
        </div>
      </div>

      <!-- 详情错误 -->
      <div v-else-if="detailError" class="flex flex-col items-center gap-3 py-10 text-center">
        <span
          class="w-12 h-12 rounded-full bg-md-danger-surface text-md-danger flex items-center justify-center"
        >
          <Icon name="error" size="lg" />
        </span>
        <p class="text-md2-body2 text-md-text-high">问卷加载失败</p>
        <p class="text-md2-caption text-md-text-medium max-w-sm leading-relaxed">{{ detailError }}</p>
        <button class="md-btn-filled mt-1" @click="openDetail(activeItem!)">
          <Icon name="refresh" size="sm" />
          重试
        </button>
      </div>

      <template v-else>
        <!-- 说明（直接落画布） -->
        <p
          v-if="detail.desc"
          class="text-md2-body2 text-md-text-medium leading-relaxed whitespace-pre-wrap"
        >
          {{ detail.desc }}
        </p>

        <!-- 已提交提示 -->
        <Alert
          v-if="activeItem?.isSubmitted || !detail.canSubmit"
          kind="success"
          title="该问卷已提交"
        >
          <p class="md-alert-text">提交后不可修改</p>
        </Alert>

        <!-- 题目：表单直接落画布，每题之间用 1px 分割线 -->
        <div class="md-rows">
          <section
            v-for="(question, idx) in detail.questions"
            :key="question.dm"
            class="py-4 space-y-3"
          >
            <div class="flex items-start gap-2">
              <span
                class="w-6 h-6 rounded-full bg-md-surface-2 text-md2-caption text-md-text-medium flex items-center justify-center shrink-0 tabular-nums mt-0.5"
              >
                {{ idx + 1 }}
              </span>
              <div class="min-w-0 flex-1">
                <h3 class="text-md2-subtitle2 text-md-text-high leading-snug">
                  {{ question.title }}
                  <span v-if="question.required" class="text-md-danger ml-0.5">*</span>
                </h3>
                <p v-if="question.desc" class="text-md2-caption text-md-text-medium mt-1 leading-relaxed">
                  {{ question.desc }}
                </p>
              </div>
            </div>

            <!-- 单选 -->
            <div v-if="classify(question) === 'single'" class="space-y-1.5">
              <label
                v-for="opt in question.options"
                :key="opt.dm"
                class="flex items-center gap-2.5 px-3 py-2.5 rounded-md2-md border cursor-pointer transition-colors duration-md2-short"
                :class="answers[question.dm] === opt.dm
                  ? 'border-md-primary bg-brand-50'
                  : 'border-md-card-border hover:bg-md-surface-1'"
              >
                <input
                  type="radio"
                  :name="question.dm"
                  :value="opt.dm"
                  :checked="answers[question.dm] === opt.dm"
                  :disabled="readonly"
                  class="md-radio shrink-0"
                  @change="answers[question.dm] = opt.dm"
                />
                <span class="text-md2-body2 text-md-text-high">{{ opt.name }}</span>
              </label>
            </div>

            <!-- 多选 -->
            <div v-else-if="classify(question) === 'multi'" class="space-y-1.5">
              <label
                v-for="opt in question.options"
                :key="opt.dm"
                class="flex items-center gap-2.5 px-3 py-2.5 rounded-md2-md border cursor-pointer transition-colors duration-md2-short"
                :class="multiHas(question.dm, opt.dm)
                  ? 'border-md-primary bg-brand-50'
                  : 'border-md-card-border hover:bg-md-surface-1'"
              >
                <input
                  type="checkbox"
                  :value="opt.dm"
                  :checked="multiHas(question.dm, opt.dm)"
                  :disabled="readonly"
                  class="md-checkbox shrink-0"
                  @change="toggleMulti(question.dm, opt.dm)"
                />
                <span class="text-md2-body2 text-md-text-high">{{ opt.name }}</span>
              </label>
            </div>

            <!-- 填空 -->
            <div v-else>
              <input
                v-if="classify(question) === 'text' && !isLongText(question)"
                :type="isDate(question) ? 'date' : isPhone(question) ? 'tel' : 'text'"
                :value="textAnswer(question.dm)"
                :disabled="readonly"
                class="md-field"
                placeholder="请填写"
                @input="answers[question.dm] = ($event.target as HTMLInputElement).value"
              />
              <textarea
                v-else
                :value="textAnswer(question.dm)"
                :disabled="readonly"
                rows="3"
                class="md-field resize-none"
                placeholder="请填写"
                @input="answers[question.dm] = ($event.target as HTMLTextAreaElement).value"
              />
            </div>
          </section>
        </div>

        <!-- 提交条：贴在画布底部的操作区，不是卡片 -->
        <div
          v-if="!readonly && detail.questions.length > 0"
          class="flex flex-wrap items-center justify-between gap-3 border-t border-md-card-border pt-4"
        >
          <div class="text-md2-caption text-md-text-medium">
            共 {{ detail.questions.length }} 题
            <span v-if="unansweredRequired > 0" class="text-md-danger ml-1">
              · {{ unansweredRequired }} 道必答题未填
            </span>
          </div>
          <button class="md-btn-filled" :disabled="submitting || unansweredRequired > 0" @click="handleSubmit">
            <Icon v-if="submitting" name="refresh" size="sm" class="animate-spin" />
            {{ submitting ? '提交中…' : '提交问卷' }}
          </button>
        </div>

        <Alert v-if="submitError" kind="error" :text="submitError" />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import NoteCard from '../components/ui/NoteCard.vue';
import Alert from '../components/ui/Alert.vue';
import MetricGrid, { type MetricItem } from '../components/ui/MetricGrid.vue';
import {
  fetchQuestionnaireList,
  fetchQuestionnaireDetail,
  submitQuestionnaire,
  questionnaireStatusChip,
  dateOnly,
  type QuestionnaireItem,
  type QuestionnaireDetail,
  type QuestionnaireQuestion,
} from '../api/xgxt';

// ---------------------------------------------------------------------------
// 列表状态
// ---------------------------------------------------------------------------
const loading = ref(false);
const errorMsg = ref('');
const list = ref<QuestionnaireItem[]>([]);
const activeStatus = ref('pending');

const statusTabs = [
  { id: 'pending', label: '待填写' },
  { id: 'submitted', label: '已提交' },
  { id: 'all', label: '全部' },
];

function matchStatus(item: QuestionnaireItem, status: string): boolean {
  if (status === 'all') return true;
  if (status === 'pending') return !item.isSubmitted && !item.isExpired;
  if (status === 'submitted') return item.isSubmitted;
  return true;
}

const filtered = computed(() => list.value.filter((i) => matchStatus(i, activeStatus.value)));

function countByStatus(status: string): number {
  return list.value.filter((i) => matchStatus(i, status)).length;
}

const stats = computed(() => [
  { label: '问卷总数', value: list.value.length },
  { label: '待填写', value: countByStatus('pending') },
  { label: '已提交', value: countByStatus('submitted') },
  { label: '已截止', value: list.value.filter((i) => i.isExpired).length },
]);

/** 统计指标组（原来的 4 张统计卡 → 一组指标，竖线分隔、无外框） */
const statMetrics = computed<MetricItem[]>(() =>
  stats.value.map((s) => ({ label: s.label, value: s.value })),
);

async function loadList() {
  loading.value = true;
  errorMsg.value = '';
  try {
    list.value = await fetchQuestionnaireList();
  } catch (err: any) {
    errorMsg.value = err?.message || '请检查网络或登录状态';
  } finally {
    loading.value = false;
  }
}

// ---------------------------------------------------------------------------
// 详情 / 答题
// ---------------------------------------------------------------------------
const activeItem = ref<QuestionnaireItem | null>(null);
const detail = ref<QuestionnaireDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const answers = ref<Record<string, string | string[]>>({});
const submitting = ref(false);
const submitError = ref('');

/** 题目分类：单选 / 多选 / 填空 */
function classify(q: QuestionnaireQuestion): 'single' | 'multi' | 'text' {
  if (q.stType === '2') return 'multi';
  if (q.stType === '1' || q.options.length > 0) return 'single';
  return 'text';
}

/** 填空题细分为长文本（无 txType 或 txType=1 且题目较长时用 textarea） */
function isLongText(q: QuestionnaireQuestion): boolean {
  return q.stType === '4' && (q.txType === '' || q.txType === '1') && q.title.length > 20;
}

/** 日期型填空（txType 3/4） */
function isDate(q: QuestionnaireQuestion): boolean {
  return q.stType === '4' && (q.txType === '3' || q.txType === '4');
}

/** 数字/电话型填空（txType 2） */
function isPhone(q: QuestionnaireQuestion): boolean {
  return q.stType === '4' && q.txType === '2';
}

const readonly = computed(
  () => Boolean(activeItem.value?.isSubmitted) || detail.value?.canSubmit === false,
);

async function openDetail(item: QuestionnaireItem) {
  activeItem.value = item;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  answers.value = {};
  submitError.value = '';

  try {
    const d = await fetchQuestionnaireDetail(item.taskTimeM);
    // 回填已填写过的答案
    const seed: Record<string, string | string[]> = {};
    for (const q of d.questions) {
      if (q.stType === '2') {
        seed[q.dm] = q.answer ? q.answer.split(',').filter(Boolean) : [];
      } else {
        seed[q.dm] = q.answer ?? '';
      }
    }
    answers.value = seed;
    detail.value = d;
  } catch (err: any) {
    detailError.value = err?.message || '请检查网络或登录状态';
  } finally {
    detailLoading.value = false;
  }
}

function backToList() {
  detail.value = null;
  activeItem.value = null;
  answers.value = {};
  submitError.value = '';
}

// --- 多选操作 ---
function multiHas(questionDm: string, optionDm: string): boolean {
  const value = answers.value[questionDm];
  return Array.isArray(value) && value.includes(optionDm);
}

function toggleMulti(questionDm: string, optionDm: string) {
  const current = answers.value[questionDm];
  const arr = Array.isArray(current) ? [...current] : [];
  const idx = arr.indexOf(optionDm);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(optionDm);
  answers.value[questionDm] = arr;
}

function textAnswer(questionDm: string): string {
  const value = answers.value[questionDm];
  return typeof value === 'string' ? value : '';
}

/** 必答题未填数量 */
const unansweredRequired = computed(() => {
  const d = detail.value;
  if (!d) return 0;
  let count = 0;
  for (const q of d.questions) {
    if (!q.required) continue;
    const value = answers.value[q.dm];
    const empty = Array.isArray(value) ? value.length === 0 : (value ?? '').trim() === '';
    if (empty) count++;
  }
  return count;
});

async function handleSubmit() {
  if (!detail.value || !activeItem.value || submitting.value) return;
  submitting.value = true;
  submitError.value = '';

  try {
    await submitQuestionnaire(activeItem.value.taskTimeM, answers.value);
    await loadList();
    backToList();
  } catch (err: any) {
    submitError.value = err?.message || '提交失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

onMounted(loadList);
</script>
