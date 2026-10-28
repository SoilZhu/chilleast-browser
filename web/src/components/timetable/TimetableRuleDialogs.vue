<template>
  <!-- ===================================================================
       课表调整对话框（对应原版 timetable_rule_dialogs.dart 的四个对话框）
       -------------------------------------------------------------------
       · mode = reschedule：调课（单门调课 / 整天调休）
       · mode = suspension：停课（起止周 + 起止星期 + 课程 + 可选节次）
       · mode = custom    ：加课（课程名/教师/教室 + 周次 + 星期 + 节次）
       · mode = list      ：我的调整（列出规则，可逐条删除 / 清空全部）

       保存后 emit('saved', 最新规则数组)；清空全部 emit('cleared', [])。
       父级（TimetableRuleMenu）据此回填并通知课表刷新。
       =================================================================== -->
  <div
    class="md-scrim flex items-center justify-center p-4"
    @click.self="onScrimClick"
  >
    <div class="md-dialog max-w-lg" role="dialog" aria-modal="true">
      <!-- 卡头：类型图标 + 标题 + 关闭 -->
      <div class="md-dialog-header">
        <div class="flex min-w-0 items-center gap-3">
          <span
            :class="[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              meta.bg,
              meta.fg,
            ]"
          >
            <Icon :name="meta.icon" size="md" />
          </span>
          <h3 class="md-dialog-title truncate">{{ meta.title }}</h3>
        </div>
        <button class="md-icon-btn-sm -mr-2 shrink-0" type="button" title="关闭" @click="emit('close')">
          <Icon name="close" size="sm" />
        </button>
      </div>

      <!-- ================= 主体 ================= -->
      <div class="md-dialog-body max-h-[68vh] space-y-4 overflow-y-auto">
        <!-- ---------------- 1. 调课 ---------------- -->
        <template v-if="mode === 'reschedule'">
          <!-- 模式选择 chip -->
          <div class="flex gap-2">
            <button
              v-for="opt in RESCHEDULE_MODES"
              :key="opt.id"
              type="button"
              :class="rescheduleMode === opt.id ? 'md-chip-filter-active' : 'md-chip-filter'"
              @click="rescheduleMode = opt.id"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- 模式 0：单门调课 -->
          <template v-if="rescheduleMode === 0">
            <p v-if="courseNames.length === 0" class="py-6 text-center text-md2-body2 text-md-text-disabled">
              暂无课程，请先同步课表
            </p>

            <template v-else>
              <div>
                <label class="md-label">课程</label>
                <select v-model="singleCourseName" class="md-select">
                  <option v-for="name in courseNames" :key="name" :value="name">{{ name }}</option>
                </select>
              </div>

              <!-- 同名课有多个时段时才需要选时段 -->
              <div v-if="matchingSlots.length > 1">
                <label class="md-label">上课时段</label>
                <select v-model.number="singleSlotIndex" class="md-select">
                  <option v-for="(slot, idx) in matchingSlots" :key="idx" :value="idx">
                    {{ slotLabel(slot) }}
                  </option>
                </select>
              </div>
              <p v-else-if="activeSlot" class="text-md2-caption text-md-text-medium">
                平时：{{ weekdayName(activeSlot.course.dayOfWeek) }}
                第{{ activeSlot.course.startPeriod }}-{{ activeSlot.course.endPeriod }}节
                ({{ activeSlot.course.weeks }})
              </p>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="md-label">原周次</label>
                  <select v-model.number="singleSourceWeekModel" class="md-select">
                    <option v-for="w in singleWeekOptionsResolved" :key="w" :value="w">
                      {{ weekLabel(w, currentWeek) }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="md-label">原时段</label>
                  <div
                    class="rounded-md2-sm bg-md-surface-2 px-3.5 py-2.5 text-md2-body2 text-md-text-high"
                  >
                    {{ weekdayName(slotDay) }} 第{{ slotStartP }}-{{ slotEndP }}节
                  </div>
                </div>
              </div>

              <p v-if="!isSingleActiveInWeek && activeSlot" class="text-md2-caption text-md-warning">
                第{{ effSingleSourceWeek }}周没有这节课
              </p>

              <div>
                <div class="md-label">调到</div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="md-label">新周次</label>
                    <select v-model.number="singleTargetWeek" class="md-select">
                      <option v-for="w in range(MAX_WEEK)" :key="w" :value="w">第{{ w }}周</option>
                    </select>
                  </div>
                  <div>
                    <label class="md-label">新星期</label>
                    <select v-model.number="singleTargetDayOfWeek" class="md-select">
                      <option v-for="d in range(7)" :key="d" :value="d">{{ weekdayName(d) }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label class="md-label">新节次</label>
                <select v-model.number="singleTargetPeriodChoice" class="md-select">
                  <option v-for="choice in PERIOD_CHOICES" :key="choice" :value="choice">
                    {{ periodChoiceLabel(choice) }}
                  </option>
                </select>
              </div>

              <!-- 汇总提示条（原版底部蓝色汇总） -->
              <p class="rounded-md2-sm bg-md-info-surface px-3 py-2.5 text-md2-caption leading-relaxed text-[#185abc]">
                {{ singleSummary }}
              </p>
            </template>
          </template>

          <!-- 模式 1：整天调休 -->
          <template v-else>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="md-label">原周次</label>
                <select v-model.number="wholeSourceWeek" class="md-select">
                  <option v-for="w in range(MAX_WEEK)" :key="w" :value="w">
                    {{ weekLabel(w, currentWeek) }}
                  </option>
                </select>
              </div>
              <div>
                <label class="md-label">原星期</label>
                <select v-model.number="wholeSourceDayOfWeek" class="md-select">
                  <option v-for="d in range(7)" :key="d" :value="d">{{ weekdayName(d) }}</option>
                </select>
              </div>
            </div>

            <p v-if="wholeSourceCourses.length === 0" class="text-md2-caption text-md-danger">
              当天没有课
            </p>
            <p v-else class="text-md2-caption text-md-text-medium">
              当天有 {{ wholeSourceCourses.length }} 门课
            </p>

            <div>
              <div class="md-label">调到</div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="md-label">目标周次</label>
                  <select v-model.number="wholeTargetWeek" class="md-select">
                    <option v-for="w in range(MAX_WEEK)" :key="w" :value="w">第{{ w }}周</option>
                  </select>
                </div>
                <div>
                  <label class="md-label">目标星期</label>
                  <select v-model.number="wholeTargetDayOfWeek" class="md-select">
                    <option v-for="d in range(7)" :key="d" :value="d">{{ weekdayName(d) }}</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <div class="md-label">调课方式</div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="opt in ACTION_OPTIONS"
                  :key="opt.id"
                  type="button"
                  :class="wholeDayAction === opt.id ? 'md-chip-filter-active' : 'md-chip-filter'"
                  @click="wholeDayAction = opt.id"
                >
                  {{ opt.label }}
                </button>
              </div>
              <p class="mt-1.5 text-md2-caption leading-relaxed text-md-text-medium">
                {{ ACTION_DESC[wholeDayAction] }}
              </p>
            </div>

            <p class="rounded-md2-sm bg-md-info-surface px-3 py-2.5 text-md2-caption leading-relaxed text-[#185abc]">
              {{ wholeSummary }}
            </p>
          </template>
        </template>

        <!-- ---------------- 2. 停课 ---------------- -->
        <template v-else-if="mode === 'suspension'">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="md-label">起始周</label>
              <select v-model.number="suspStartWeek" class="md-select">
                <option v-for="w in range(MAX_WEEK)" :key="w" :value="w">
                  {{ weekLabel(w, currentWeek) }}
                </option>
              </select>
            </div>
            <div>
              <label class="md-label">起始星期</label>
              <select v-model.number="suspStartDay" class="md-select">
                <option v-for="d in range(7)" :key="d" :value="d">{{ weekdayName(d) }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="md-label">结束周</label>
              <select v-model.number="suspEndWeek" class="md-select">
                <option v-for="w in range(MAX_WEEK)" :key="w" :value="w">
                  {{ weekLabel(w, currentWeek) }}
                </option>
              </select>
            </div>
            <div>
              <label class="md-label">结束星期</label>
              <select v-model.number="suspEndDay" class="md-select">
                <option v-for="d in range(7)" :key="d" :value="d">{{ weekdayName(d) }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="md-label">课程</label>
            <select v-model="suspCourseName" class="md-select">
              <option value="">全部课程</option>
              <option v-for="name in courseNames" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>

          <label class="flex cursor-pointer items-center gap-2.5 py-1">
            <input v-model="suspLimitPeriod" class="md-checkbox" type="checkbox" />
            <span class="text-md2-body2 text-md-text-high">指定节次</span>
          </label>

          <div v-if="suspLimitPeriod" class="grid grid-cols-2 gap-3">
            <div>
              <label class="md-label">开始节次</label>
              <select v-model.number="suspStartPeriod" class="md-select">
                <option v-for="p in range(MAX_PERIOD)" :key="p" :value="p">第{{ p }}节</option>
              </select>
            </div>
            <div>
              <label class="md-label">结束节次</label>
              <select v-model.number="suspEndPeriod" class="md-select">
                <option v-for="p in range(MAX_PERIOD)" :key="p" :value="p">第{{ p }}节</option>
              </select>
            </div>
          </div>

          <p class="rounded-md2-sm bg-md-info-surface px-3 py-2.5 text-md2-caption leading-relaxed text-[#185abc]">
            {{ suspensionSummary }}
          </p>
        </template>

        <!-- ---------------- 3. 加课 ---------------- -->
        <template v-else-if="mode === 'custom'">
          <div>
            <label class="md-label">课程名称</label>
            <input
              v-model="customName"
              class="md-field"
              type="text"
              maxlength="40"
              placeholder="如：自习、补课"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="md-label">授课教师 (选填)</label>
              <input v-model="customTeacher" class="md-field" type="text" maxlength="20" placeholder="教师" />
            </div>
            <div>
              <label class="md-label">教室 (选填)</label>
              <input v-model="customClassroom" class="md-field" type="text" maxlength="30" placeholder="教室" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="md-label">起始周</label>
              <select v-model.number="customStartWeek" class="md-select">
                <option v-for="w in range(MAX_WEEK)" :key="w" :value="w">第{{ w }}周</option>
              </select>
            </div>
            <div>
              <label class="md-label">结束周</label>
              <select v-model.number="customEndWeek" class="md-select">
                <option v-for="w in range(MAX_WEEK)" :key="w" :value="w">第{{ w }}周</option>
              </select>
            </div>
          </div>

          <div>
            <label class="md-label">星期</label>
            <select v-model.number="customDayOfWeek" class="md-select">
              <option v-for="d in range(7)" :key="d" :value="d">{{ weekdayName(d) }}</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="md-label">开始节次</label>
              <select v-model.number="customStartPeriod" class="md-select">
                <option v-for="p in range(MAX_PERIOD)" :key="p" :value="p">第{{ p }}节</option>
              </select>
            </div>
            <div>
              <label class="md-label">结束节次</label>
              <select v-model.number="customEndPeriod" class="md-select">
                <option v-for="p in range(MAX_PERIOD)" :key="p" :value="p">第{{ p }}节</option>
              </select>
            </div>
          </div>

          <p class="rounded-md2-sm bg-md-info-surface px-3 py-2.5 text-md2-caption leading-relaxed text-[#185abc]">
            {{ customSummary }}
          </p>
        </template>

        <!-- ---------------- 4. 我的调整 ---------------- -->
        <template v-else>
          <div v-if="listRules.length === 0" class="flex flex-col items-center gap-3 py-8">
            <Icon name="check-circle" size="xl" class="text-md-text-hint" />
            <p class="text-md2-body2 text-md-text-disabled">还没有任何调整</p>
          </div>

          <div v-else class="md-rows">
            <div
              v-for="rule in listRules"
              :key="rule.id"
              class="flex items-start gap-2.5 py-2.5"
            >
              <span :class="typeChipClass(rule.type)" class="mt-0.5 shrink-0">
                {{ RULE_TYPE_LABEL[rule.type] }}
              </span>
              <p class="min-w-0 flex-1 text-md2-body2 leading-snug text-md-text-high">
                {{ describeRule(rule) }}
              </p>
              <button
                class="md-icon-btn-sm -my-1 shrink-0"
                type="button"
                title="删除"
                :disabled="saving"
                @click="onDeleteRule(rule)"
              >
                <Icon name="trash" size="sm" class="text-md-danger" />
              </button>
            </div>
          </div>
        </template>

        <!-- 错误提示（替代 alert） -->
        <p
          v-if="errorMessage"
          class="rounded-md2-sm bg-md-danger-surface px-3 py-2 text-md2-caption leading-relaxed text-[#b3261e]"
          role="status"
        >
          {{ errorMessage }}
        </p>
      </div>

      <!-- ================= 动作 ================= -->
      <div class="md-dialog-actions">
        <template v-if="mode === 'list'">
          <button
            v-if="listRules.length > 0"
            class="md-btn-text mr-auto text-md-danger hover:bg-md-danger-surface"
            type="button"
            :disabled="saving"
            @click="askClearAll"
          >
            清空全部
          </button>
          <button class="md-btn-text" type="button" @click="emit('close')">关闭</button>
        </template>

        <template v-else>
          <button class="md-btn-text" type="button" :disabled="saving" @click="emit('close')">
            取消
          </button>
          <button class="md-btn-filled" type="button" :disabled="saving" @click="onSave">
            {{ mode === 'custom' ? '添加' : '保存' }}
          </button>
        </template>
      </div>
    </div>
  </div>

  <!-- ============ 二次确认（不用 confirm()） ============ -->
  <div
    v-if="confirmState"
    class="md-scrim flex items-center justify-center p-4"
    @click.self="confirmState = null"
  >
    <div class="md-dialog max-w-sm" role="alertdialog" aria-modal="true">
      <div class="md-dialog-header">
        <h3 class="md-dialog-title">{{ confirmState.title }}</h3>
      </div>
      <div class="md-dialog-body">{{ confirmState.message }}</div>
      <div class="md-dialog-actions">
        <button class="md-btn-text" type="button" @click="confirmState = null">返回</button>
        <button
          :class="confirmState.danger ? 'md-btn-danger' : 'md-btn-filled'"
          type="button"
          @click="runConfirm"
        >
          {{ confirmState.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from '@/components/Icon.vue';
import type { TimetableCourse } from '@/api/academic';
import {
  appendTimetableRule,
  clearTimetableRules,
  removeTimetableRule,
} from '@/api/timetable-rules';
import {
  ACTION_DESC,
  ACTION_LABEL,
  MAX_PERIOD,
  MAX_WEEK,
  PERIOD_CHOICES,
  RULE_TYPE_LABEL,
  buildCustomCourseRule,
  buildRescheduleRule,
  buildSuspensionRule,
  courseNamesOf,
  describeRule,
  parseWeeks,
  periodChoiceLabel,
  range,
  slotLabel,
  slotsOf,
  summarizeCustomCourse,
  summarizeReschedule,
  summarizeSuspension,
  summarizeWholeDay,
  weekLabel,
  weekdayName,
  weeksFromRange,
  type RescheduleAction,
  type RuleType,
  type TimetableRule,
} from '@/utils/timetable-rules';

const props = withDefaults(
  defineProps<{
    /** 打开哪个对话框 */
    mode: 'reschedule' | 'suspension' | 'custom' | 'list';
    /** 全学期课程 */
    courses: TimetableCourse[];
    /** 已有规则（我的调整列表 / 删除后回显） */
    rules?: TimetableRule[];
    /** 当前自然周（各对话框的默认值） */
    currentWeek?: number;
  }>(),
  {
    rules: () => [],
    currentWeek: 1,
  },
);

const emit = defineEmits<{
  /** 关闭当前对话框 */
  (e: 'close'): void;
  /** 规则已保存（新增/删除），参数是最新规则数组 */
  (e: 'saved', rules: TimetableRule[]): void;
  /** 已清空全部调整 */
  (e: 'cleared', rules: TimetableRule[]): void;
}>();

// ---------------------------------------------------------------------------
// 通用状态
// ---------------------------------------------------------------------------

const saving = ref(false);
const errorMessage = ref('');

interface ConfirmState {
  title: string;
  message: string;
  confirmText: string;
  danger: boolean;
  run: () => void;
}

const confirmState = ref<ConfirmState | null>(null);

function runConfirm() {
  const state = confirmState.value;
  confirmState.value = null;
  state?.run();
}

/** 点遮罩关闭：有二次确认时先关确认，避免一下关两层 */
function onScrimClick() {
  if (confirmState.value) {
    confirmState.value = null;
    return;
  }
  emit('close');
}

const MODE_META = {
  reschedule: { title: '调课', icon: 'swap', bg: 'bg-md-accent-surface', fg: 'text-md-accent' },
  suspension: { title: '停课', icon: 'leave', bg: 'bg-md-warning-surface', fg: 'text-md-warning' },
  custom: { title: '加课', icon: 'add-circle', bg: 'bg-md-success-surface', fg: 'text-md-success' },
  list: { title: '我的调整', icon: 'rule', bg: 'bg-md-danger-surface', fg: 'text-md-danger' },
} as const;

const meta = computed(() => MODE_META[props.mode]);

const RESCHEDULE_MODES = [
  { id: 0 as const, label: '单门调课' },
  { id: 1 as const, label: '整天调休' },
];

const ACTION_OPTIONS: Array<{ id: RescheduleAction; label: string }> = [
  { id: 'copy', label: ACTION_LABEL.copy },
  { id: 'move', label: ACTION_LABEL.move },
  { id: 'swap', label: ACTION_LABEL.swap },
];

/** 课程名下拉（去重升序） */
const courseNames = computed(() => courseNamesOf(props.courses));

/** 规则列表（我的调整）：保持父级传入的顺序（父级已按执行顺序排好） */
const listRules = computed(() => props.rules ?? []);

function typeChipClass(type: RuleType): string {
  switch (type) {
    case 'reschedule':
      return 'md-chip-info';
    case 'suspension':
      return 'md-chip-warning';
    case 'customCourse':
      return 'md-chip-success';
    default:
      return 'md-chip-neutral';
  }
}

// ---------------------------------------------------------------------------
// 1. 调课
// ---------------------------------------------------------------------------

const rescheduleMode = ref<0 | 1>(0);

// 单门调课
const firstCourseName = courseNames.value[0] ?? '';
/** 初始原周次：落在第一门课真正有课的周（原版换课程时也是这个逻辑） */
const initialWeeks = slotsOf(props.courses, firstCourseName)[0]?.weeks ?? [];
const initialWeek = initialWeeks.includes(props.currentWeek)
  ? props.currentWeek
  : (initialWeeks[0] ?? props.currentWeek);

const singleCourseName = ref<string>(firstCourseName);
const singleSlotIndex = ref(0);
const singleSourceWeek = ref(initialWeek);
const singleTargetWeek = ref(initialWeek);
const singleTargetDayOfWeek = ref(5); // 原版默认周五
const singleTargetPeriodChoice = ref(0); // 0 = 保持原节次

// 整天调休
const wholeSourceWeek = ref(props.currentWeek);
const wholeSourceDayOfWeek = ref(5); // 原版默认周五
const wholeTargetWeek = ref(props.currentWeek);
const wholeTargetDayOfWeek = ref(7); // 原版默认周日
const wholeDayAction = ref<RescheduleAction>('move');

/** 当前课程的全部时段（同名课可能有多段） */
const matchingSlots = computed(() => slotsOf(props.courses, singleCourseName.value));

const activeSlot = computed(() => {
  const slots = matchingSlots.value;
  if (slots.length === 0) return null;
  const index = Math.min(Math.max(singleSlotIndex.value, 0), slots.length - 1);
  return slots[index];
});

const slotDay = computed(() => activeSlot.value?.course.dayOfWeek ?? 1);
const slotStartP = computed(() => activeSlot.value?.course.startPeriod ?? 1);
const slotEndP = computed(() => activeSlot.value?.course.endPeriod ?? 2);

/** 原周次下拉：只列这个时段真正有课的周 */
const singleWeekOptions = computed(() => activeSlot.value?.weeks ?? []);

/**
 * 下拉实际渲染的选项：周次解析不出来时（脏数据）至少给出当前选中的那一周，
 * 否则 `<select>` 会显示空白，用户以为功能坏了。
 */
const singleWeekOptionsResolved = computed(() =>
  singleWeekOptions.value.length > 0 ? singleWeekOptions.value : [singleSourceWeek.value],
);

const effSingleSourceWeek = computed(() => {
  const options = singleWeekOptions.value;
  if (options.includes(singleSourceWeek.value)) return singleSourceWeek.value;
  return options[0] ?? singleSourceWeek.value;
});

/** 原周次下拉的 v-model：换源周次时同步把目标周次拉齐（与原版一致） */
const singleSourceWeekModel = computed({
  get: () => effSingleSourceWeek.value,
  set: (value: number) => {
    singleSourceWeek.value = value;
    singleTargetWeek.value = value;
  },
});

const isSingleActiveInWeek = computed(() =>
  activeSlot.value ? activeSlot.value.weeks.includes(effSingleSourceWeek.value) : false,
);

const targetStartP = computed(() =>
  singleTargetPeriodChoice.value === 0 ? slotStartP.value : singleTargetPeriodChoice.value,
);
const targetEndP = computed(() =>
  singleTargetPeriodChoice.value === 0 ? slotEndP.value : singleTargetPeriodChoice.value + 1,
);

const singleSummary = computed(() =>
  summarizeReschedule({
    sourceWeek: effSingleSourceWeek.value,
    courseName: singleCourseName.value,
    sourceDayOfWeek: slotDay.value,
    sourceStartPeriod: slotStartP.value,
    sourceEndPeriod: slotEndP.value,
    targetWeek: singleTargetWeek.value,
    targetDayOfWeek: singleTargetDayOfWeek.value,
    targetStartPeriod: targetStartP.value,
    targetEndPeriod: targetEndP.value,
  }),
);

/** 当天有课的课程（整天调休的可用性判断） */
const wholeSourceCourses = computed(() =>
  props.courses.filter(
    (course) =>
      course.dayOfWeek === wholeSourceDayOfWeek.value &&
      parseWeeks(course.weeks).includes(wholeSourceWeek.value),
  ),
);

const wholeSummary = computed(() =>
  summarizeWholeDay({
    sourceWeek: wholeSourceWeek.value,
    sourceDayOfWeek: wholeSourceDayOfWeek.value,
    targetWeek: wholeTargetWeek.value,
    targetDayOfWeek: wholeTargetDayOfWeek.value,
    action: wholeDayAction.value,
  }),
);

/** 换课程：重置时段下标，并把原周次落在该课真正有课的周 */
watch(singleCourseName, (name) => {
  singleSlotIndex.value = 0;
  const slots = slotsOf(props.courses, name);
  const weeks = slots[0]?.weeks ?? [];
  singleSourceWeek.value = weeks.includes(props.currentWeek)
    ? props.currentWeek
    : (weeks[0] ?? props.currentWeek);
  singleTargetWeek.value = singleSourceWeek.value;
});

/** 换时段：同上，原周次跟着该时段的实际周次走 */
watch(singleSlotIndex, (index) => {
  const slots = matchingSlots.value;
  const weeks = slots[Math.min(Math.max(index, 0), slots.length - 1)]?.weeks ?? [];
  singleSourceWeek.value = weeks.includes(props.currentWeek)
    ? props.currentWeek
    : (weeks[0] ?? props.currentWeek);
  singleTargetWeek.value = singleSourceWeek.value;
});

// ---------------------------------------------------------------------------
// 2. 停课
// ---------------------------------------------------------------------------

const suspStartWeek = ref(props.currentWeek);
const suspStartDay = ref(1);
const suspEndWeek = ref(props.currentWeek);
const suspEndDay = ref(7);
const suspCourseName = ref(''); // '' = 全部课程
const suspLimitPeriod = ref(false);
const suspStartPeriod = ref(1);
const suspEndPeriod = ref(2);

/** 起止日期保持「起 ≤ 止」（与原版下拉的联动一致） */
watch([suspStartWeek, suspStartDay], () => {
  if (suspStartWeek.value * 7 + suspStartDay.value > suspEndWeek.value * 7 + suspEndDay.value) {
    suspEndWeek.value = suspStartWeek.value;
    suspEndDay.value = suspStartDay.value;
  }
});
watch([suspEndWeek, suspEndDay], () => {
  if (suspEndWeek.value * 7 + suspEndDay.value < suspStartWeek.value * 7 + suspStartDay.value) {
    suspStartWeek.value = suspEndWeek.value;
    suspStartDay.value = suspEndDay.value;
  }
});
watch(suspStartPeriod, (value) => {
  if (value > suspEndPeriod.value) suspEndPeriod.value = value;
});
watch(suspEndPeriod, (value) => {
  if (value < suspStartPeriod.value) suspStartPeriod.value = value;
});

const suspensionSummary = computed(() =>
  summarizeSuspension({
    startWeek: suspStartWeek.value,
    endWeek: suspEndWeek.value,
    startDayOfWeek: suspStartDay.value,
    endDayOfWeek: suspEndDay.value,
    courseName: suspCourseName.value,
    ...(suspLimitPeriod.value
      ? { startPeriod: suspStartPeriod.value, endPeriod: suspEndPeriod.value }
      : {}),
  }),
);

// ---------------------------------------------------------------------------
// 3. 加课
// ---------------------------------------------------------------------------

const customName = ref('');
const customTeacher = ref('');
const customClassroom = ref('');
const customStartWeek = ref(props.currentWeek);
const customEndWeek = ref(Math.min(props.currentWeek + 15, MAX_WEEK));
const customDayOfWeek = ref(1);
const customStartPeriod = ref(1);
const customEndPeriod = ref(2);

watch(customStartPeriod, (value) => {
  if (value > customEndPeriod.value) customEndPeriod.value = value;
});
watch(customEndPeriod, (value) => {
  if (value < customStartPeriod.value) customStartPeriod.value = value;
});
watch(customStartWeek, (value) => {
  if (value > customEndWeek.value) customEndWeek.value = value;
});
watch(customEndWeek, (value) => {
  if (value < customStartWeek.value) customStartWeek.value = value;
});

const customSummary = computed(() =>
  summarizeCustomCourse({
    courseName: customName.value.trim() || '未命名',
    dayOfWeek: customDayOfWeek.value,
    startPeriod: Math.min(customStartPeriod.value, customEndPeriod.value),
    endPeriod: Math.max(customStartPeriod.value, customEndPeriod.value),
    weeks: weeksFromRange(customStartWeek.value, customEndWeek.value),
  }),
);

// ---------------------------------------------------------------------------
// 保存（统一入口：写本地镜像 + 云端备份，成功后把最新规则交给父级）
// ---------------------------------------------------------------------------

/**
 * 执行一次写操作并处理忙碌态/错误提示。
 * `action` 返回最新规则数组；成功后按 `close` 决定是否关掉对话框。
 */
async function submit(
  action: () => Promise<TimetableRule[]>,
  options: { close: boolean; event?: 'saved' | 'cleared' },
): Promise<boolean> {
  if (saving.value) return false;
  saving.value = true;
  errorMessage.value = '';
  try {
    const next = await action();
    if ((options.event ?? 'saved') === 'cleared') emit('cleared', next);
    else emit('saved', next);
    if (options.close) emit('close');
    return true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败，请稍后重试';
    return false;
  } finally {
    saving.value = false;
  }
}

/** 主按钮：按模式分别校验后保存 */
async function onSave() {
  if (saving.value) return;
  errorMessage.value = '';

  if (props.mode === 'reschedule') {
    if (rescheduleMode.value === 0) await saveSingleReschedule();
    else await saveWholeDay();
    return;
  }

  if (props.mode === 'suspension') {
    const rule = buildSuspensionRule({
      startWeek: suspStartWeek.value,
      endWeek: suspEndWeek.value,
      startDayOfWeek: suspStartDay.value,
      endDayOfWeek: suspEndDay.value,
      courseName: suspCourseName.value,
      ...(suspLimitPeriod.value
        ? { startPeriod: suspStartPeriod.value, endPeriod: suspEndPeriod.value }
        : {}),
    });
    await submit(() => appendTimetableRule(props.rules, rule), { close: true });
    return;
  }

  if (props.mode === 'custom') {
    const name = customName.value.trim();
    if (name === '') {
      errorMessage.value = '请填写课程名称';
      return;
    }
    const rule = buildCustomCourseRule({
      courseName: name,
      teacher: customTeacher.value.trim(),
      classroom: customClassroom.value.trim(),
      weeks: weeksFromRange(customStartWeek.value, customEndWeek.value),
      dayOfWeek: customDayOfWeek.value,
      startPeriod: Math.min(customStartPeriod.value, customEndPeriod.value),
      endPeriod: Math.max(customStartPeriod.value, customEndPeriod.value),
    });
    await submit(() => appendTimetableRule(props.rules, rule), { close: true });
  }
}

/** 单门调课：源周没有课时先二次确认（与原版 confirmReschedule 一致） */
async function saveSingleReschedule() {
  if (singleCourseName.value === '') {
    errorMessage.value = '请先选择课程';
    return;
  }

  const buildAndSave = () => {
    const rule = buildRescheduleRule({
      sourceWeek: effSingleSourceWeek.value,
      targetWeek: singleTargetWeek.value,
      sourceDayOfWeek: slotDay.value,
      targetDayOfWeek: singleTargetDayOfWeek.value,
      mode: 'move',
      courseName: singleCourseName.value,
      sourceStartPeriod: slotStartP.value,
      sourceEndPeriod: slotEndP.value,
      targetStartPeriod: targetStartP.value,
      targetEndPeriod: targetEndP.value,
    });
    return submit(() => appendTimetableRule(props.rules, rule), { close: true });
  };

  if (!isSingleActiveInWeek.value && activeSlot.value) {
    confirmState.value = {
      title: '确认调课',
      message: `第${effSingleSourceWeek.value}周没有《${singleCourseName.value}》，继续吗？`,
      confirmText: '继续',
      danger: false,
      run: () => {
        void buildAndSave();
      },
    };
    return;
  }

  await buildAndSave();
}

/** 整天调休：当天没有课直接拦下（与原版一致，不弹确认） */
async function saveWholeDay() {
  if (wholeSourceCourses.value.length === 0) {
    errorMessage.value = '当天没有课，无法调休';
    return;
  }

  const rule = buildRescheduleRule({
    sourceWeek: wholeSourceWeek.value,
    targetWeek: wholeTargetWeek.value,
    sourceDayOfWeek: wholeSourceDayOfWeek.value,
    targetDayOfWeek: wholeTargetDayOfWeek.value,
    mode: wholeDayAction.value,
    // 整天调休不带课程名（作用于整天）
  });
  await submit(() => appendTimetableRule(props.rules, rule), { close: true });
}

/** 删除单条规则（列表里逐条删，删完留在列表页） */
async function onDeleteRule(rule: TimetableRule) {
  await submit(() => removeTimetableRule(props.rules, rule.id), { close: false });
}

/** 清空全部（二次确认） */
function askClearAll() {
  confirmState.value = {
    title: '清空全部调整？',
    message: '清空后课表恢复为教务原样。',
    confirmText: '清空',
    danger: true,
    run: () => {
      void submit(() => clearTimetableRules(), { close: false, event: 'cleared' });
    },
  };
}
</script>
