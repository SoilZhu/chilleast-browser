<template>
  <!-- ===================================================================
       考试安排（对齐 App 的 exam_screen.dart）
       每张卡片：课程名/考试名 + 状态 chip + 时间区间 + 地点 + 备注

       ⚠️ 只显示「还没开始」的考试：原版 ExamService.fetchExams 在服务端就把
       已完成 / 已结束的历史考试滤掉了，这里再兜一层（手动添加的过期考试、
       或服务端缓存里的旧数据仍可能漏进来）。
       =================================================================== -->
  <div class="space-y-4">
    <PageHeader title="考试安排" subtitle="未开考科目与考场">
      <template #actions>
        <div class="flex flex-col items-end gap-1.5">
          <span class="md-chip-neutral">
            <Icon name="exam" size="xs" />
            {{ upcoming.length }} 门
          </span>
          <button
            type="button"
            class="md-btn-filled h-8 px-3 text-xs gap-1"
            @click="showAddModal = true"
          >
            <Icon name="plus" size="xs" />
            <span>添加考试</span>
          </button>
        </div>
      </template>
    </PageHeader>

    <!-- 添加手工考试弹窗 -->
    <div
      v-if="showAddModal"
      class="md-scrim flex items-center justify-center p-4 z-50"
      @click.self="showAddModal = false"
    >
      <div class="md-dialog max-w-lg w-full" role="dialog" aria-modal="true">
        <div class="md-dialog-header">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-md2-sm flex items-center justify-center bg-brand-50 text-md-primary">
              <Icon name="plus" size="sm" />
            </span>
            <h3 class="md-dialog-title">添加考试</h3>
          </div>
          <button type="button" class="md-icon-btn-sm" @click="showAddModal = false">
            <Icon name="close" size="sm" />
          </button>
        </div>

        <div class="md-dialog-body space-y-3.5">
          <div>
            <label class="md-label">所属课程 <span class="text-md-danger">*</span></label>
            <input
              v-model="newExamCourse"
              type="text"
              class="md-field"
              placeholder="课程名称"
              autofocus
            />
          </div>

          <div>
            <label class="md-label">考试名称（可选）</label>
            <input
              v-model="newExamTitle"
              type="text"
              class="md-field"
              placeholder="考试名称"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="md-label">考试开始时间（可选）</label>
              <input
                v-model="newExamStartTime"
                type="datetime-local"
                class="md-field"
              />
            </div>
            <div>
              <label class="md-label">考试结束时间（可选）</label>
              <input
                v-model="newExamEndTime"
                type="datetime-local"
                class="md-field"
              />
            </div>
          </div>

          <div>
            <label class="md-label">考场地点（可选）</label>
            <input
              v-model="newExamLocation"
              type="text"
              class="md-field"
              placeholder="考场地点"
            />
          </div>

          <div>
            <label class="md-label">备注信息（可选）</label>
            <textarea
              v-model="newExamRemarks"
              rows="2"
              class="md-field resize-none"
              placeholder="备注信息"
            ></textarea>
          </div>
        </div>

        <div class="md-dialog-actions border-t border-md-card-border">
          <button type="button" class="md-btn-text" @click="showAddModal = false">取消</button>
          <button
            type="button"
            class="md-btn-filled"
            :disabled="!newExamCourse.trim()"
            @click="submitAddExam"
          >
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态：落画布，不包卡片 -->
    <EmptyState v-if="upcoming.length === 0" text="暂无未开考的考试" icon="exam" />

    <!-- 考试列表：一场考试是一张卡片（独立实体），卡片内不再套盒子 -->
    <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <NoteCard
        v-for="(exam, idx) in upcoming"
        :key="exam.id || idx"
        :title="primaryTitle(exam)"
        :meta="exam.isPast ? '已结束' : '待考'"
      >
        <!-- 卡内顶部：副标题 + 倒计时（主标题已在卡头，不重复） -->
        <div class="flex items-start justify-between gap-3">
          <p
            v-if="secondaryTitle(exam)"
            class="text-md2-caption text-md-text-medium min-w-0 line-clamp-2"
          >
            {{ secondaryTitle(exam) }}
          </p>
          <span class="md-chip-info tabular-nums shrink-0 ml-auto">{{ countdownLabel(exam) }}</span>
        </div>

        <!-- 明细行：卡片内用分割线分区，不套描边盒 -->
        <div class="mt-3 border-t border-md-card-border pt-3 space-y-2">
          <!-- 考试时间 -->
          <div v-if="timeRange(exam)" class="flex items-start gap-2 text-md2-body2">
            <Icon name="clock" size="sm" class="w-4 h-4 shrink-0 mt-0.5 text-md-text-disabled" />
            <span class="text-md-text-high tabular-nums">{{ timeRange(exam) }}</span>
          </div>

          <!-- 考场 -->
          <div v-if="locationOf(exam)" class="flex items-start gap-2 text-md2-body2">
            <Icon name="map-pin" size="sm" class="w-4 h-4 shrink-0 mt-0.5 text-md-text-disabled" />
            <span class="text-md-text-high">{{ locationOf(exam) }}</span>
          </div>

          <!-- 备注 -->
          <div v-if="exam.remarks" class="flex items-start gap-2 text-md2-caption">
            <Icon name="file-text" size="sm" class="w-3.5 h-3.5 shrink-0 mt-0.5 text-md-text-disabled" />
            <span class="text-md-text-medium leading-relaxed">{{ exam.remarks }}</span>
          </div>
        </div>

        <!-- 学习通跳转 / 手动考试删除 -->
        <div v-if="exam.isManual" class="flex justify-end mt-2.5">
          <button
            type="button"
            class="md-btn-text h-8 px-2 text-md2-caption text-md-text-disabled hover:text-md-danger"
            @click.stop="emit('delete-manual', exam.id)"
          >
            <Icon name="trash" size="xs" />
            <span>删除</span>
          </button>
        </div>
        <div v-else-if="exam.detailUrl" class="flex justify-end mt-2.5">
          <a
            :href="exam.detailUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="md-btn-text h-8 px-2"
          >
            在学习通打开
            <Icon name="chevron-right" size="sm" />
          </a>
        </div>
      </NoteCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import NoteCard from './ui/NoteCard.vue';
import PageHeader from './ui/PageHeader.vue';
import EmptyState from './ui/EmptyState.vue';

const props = defineProps<{
  exams: any[];
}>();

const emit = defineEmits<{
  (e: 'add-manual', item: any): void;
  (e: 'delete-manual', id: string): void;
}>();

const showAddModal = ref(false);
const newExamCourse = ref('');
const newExamTitle = ref('');
const newExamStartTime = ref('');
const newExamEndTime = ref('');
const newExamLocation = ref('');
const newExamRemarks = ref('');

function submitAddExam() {
  const course = newExamCourse.value.trim();
  if (!course) return;

  const item = {
    id: `manual_${Date.now()}`,
    courseName: course,
    title: newExamTitle.value.trim() || course,
    time: newExamStartTime.value ? new Date(newExamStartTime.value).toISOString() : null,
    endTime: newExamEndTime.value ? new Date(newExamEndTime.value).toISOString() : null,
    location: newExamLocation.value.trim(),
    remarks: newExamRemarks.value.trim(),
    status: '待考',
    isManual: true,
    createdAt: new Date().toISOString(),
  };

  emit('add-manual', item);

  newExamCourse.value = '';
  newExamTitle.value = '';
  newExamStartTime.value = '';
  newExamEndTime.value = '';
  newExamLocation.value = '';
  newExamRemarks.value = '';
  showAddModal.value = false;
}

/**
 * 考试状态里表示「已考完」的词（对齐原版 ExamService.isPendingOrUnfinished）。
 * 只要命中就说明这场考试不该再出现在列表里。
 */
const FINISHED_STATUS = ['已完成', '已结束'];

/** 该考试是否还没开始（无时间的考试按原版口径保留） */
function isUpcoming(exam: any): boolean {
  const status = String(exam?.status || '').trim();
  if (FINISHED_STATUS.some((word) => status.includes(word))) return false;

  // 原版 ExamStorage.isUpcomingOrToday：开始时间早于今天 00:00 就算过期
  const raw = exam?.timeMs ?? exam?.time ?? exam?.timeLocal;
  if (raw === undefined || raw === null || raw === '') return true;
  const startMs = typeof raw === 'number' ? raw : new Date(raw).getTime();
  if (!Number.isFinite(startMs)) return true;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return startMs >= todayStart;
}

/** 只渲染还没开考的（服务端已过滤一遍，这里兜底手动添加与旧缓存） */
const upcoming = computed(() => (Array.isArray(props.exams) ? props.exams.filter(isUpcoming) : []));

/** 状态徽章文案：优先用服务端给的原始状态（未开始 / 进行中 / 未交…） */
function statusLabel(exam: any): string {
  const status = String(exam?.status || '').trim();
  return status || '待考';
}

/** 主标题：优先课程名（App 的 primaryTitle 逻辑） */
function primaryTitle(exam: any): string {
  const course = String(exam?.courseName || '').trim();
  if (course) return course;
  return String(exam?.title || '考试');
}

/** 副标题：课程名与标题不同时才显示标题（App 的 secondaryTitle 逻辑） */
function secondaryTitle(exam: any): string {
  const course = String(exam?.courseName || '').trim();
  const title = String(exam?.title || '').trim();
  if (!course) return '';
  if (!title || title === course) return '';
  return title;
}

function locationOf(exam: any): string {
  const loc = String(exam?.location || '').trim();
  if (loc) return loc;
  const raw = exam?.rawTimeStrs;
  if (Array.isArray(raw) && raw.length) return raw.join(' ');
  return '';
}

/**
 * 时间区间展示（App 的 timeDisplay 逻辑）：
 * 同一天 → `yyyy-MM-dd HH:mm ~ HH:mm`
 * 跨天   → `yyyy-MM-dd HH:mm ~ yyyy-MM-dd HH:mm`
 */
function timeRange(exam: any): string {
  const startRaw = exam?.timeLocal || exam?.time;
  if (!startRaw) return '';
  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) return String(startRaw);

  const startText = fmt(start);
  const endRaw = exam?.endTimeLocal || exam?.endTime;
  if (!endRaw) return startText;

  const end = new Date(endRaw);
  if (Number.isNaN(end.getTime())) return startText;

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  return sameDay ? `${startText} ~ ${fmtTime(end)}` : `${startText} ~ ${fmt(end)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 距考试还有多久 */
function countdownLabel(exam: any): string {
  const raw = exam?.time;
  if (!raw) return '即将开始';
  const target = new Date(raw).getTime();
  if (Number.isNaN(target)) return '即将开始';

  const diffMs = target - Date.now();
  if (diffMs <= 0) return '已开考';

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  if (days >= 1) return `还有 ${days} 天`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 1) return `还有 ${hours} 小时`;
  return `还有 ${Math.max(1, totalMinutes)} 分钟`;
}
</script>
