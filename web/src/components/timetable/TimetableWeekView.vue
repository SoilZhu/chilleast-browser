<template>
  <!-- ===================================================================
       周视图（对齐 ChillEast 原版 App 移动端周视图）
       -------------------------------------------------------------------
       - 7 列课程网格，按大节时段定位（1-2, 3-4, 5-6, 7-8, 9-10, 11-12）
       - 左侧时间轴：显示大节起止时间，是否显示下课时间由设置项控制
       - 课程卡片：Material 700 色彩填充、白字、圆角 6px、多节跨行合并
       - 课程冲突：堆叠图层、白色半透明微描边、右下角 layers 图标、点击切换详情
       - 移动端：按自然周滑动手势翻页（左滑下一周，右滑上一周），带平滑切页动画
       - PC 端：由父级 TimetableView 保留现有的 1-20 周快速切换条
       =================================================================== -->
  <div class="space-y-2 select-none">
    <!-- 移动端专属顶部：第 N 周标题 + 回到本周 + 步进翻页（PC 端由父级 WeekToolbar 承载） -->
    <div v-if="!isPc" class="flex items-center justify-between px-1 pb-1 pt-0.5">
      <div class="flex items-center gap-2">
        <h2 class="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">第{{ currentWeek }}周</h2>
        <span
          v-if="realWeek && currentWeek === realWeek"
          class="text-xs font-semibold text-brand bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded-full"
        >
          本周
        </span>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          v-if="realWeek && currentWeek !== realWeek"
          type="button"
          class="text-xs font-semibold text-brand dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 px-2.5 py-1 rounded-full flex items-center gap-1 active:scale-95 transition"
          @click="onGoToWeek(realWeek)"
        >
          <Icon name="calendar" size="xs" />
          <span>回到今天</span>
        </button>

        <button
          type="button"
          class="p-1 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none active:scale-90 transition"
          :disabled="currentWeek <= 1"
          title="上一周"
          @click="onGoToWeek(currentWeek - 1)"
        >
          <Icon name="chevron-left" size="sm" />
        </button>
        <button
          type="button"
          class="p-1 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none active:scale-90 transition"
          :disabled="currentWeek >= 20"
          title="下一周"
          @click="onGoToWeek(currentWeek + 1)"
        >
          <Icon name="chevron-right" size="sm" />
        </button>
      </div>
    </div>

    <!-- 加载骨架 -->
    <div v-if="loading && !timetable" class="space-y-3" aria-busy="true" aria-label="课表加载中">
      <div class="grid grid-cols-7 gap-2 pl-12">
        <div v-for="i in 7" :key="i" class="space-y-1.5 text-center">
          <div class="md-skeleton h-3 w-8 mx-auto" />
          <div class="md-skeleton h-6 w-6 rounded-full mx-auto" />
        </div>
      </div>
      <div class="space-y-2">
        <div v-for="i in 5" :key="i" class="md-skeleton h-20 w-full rounded-lg" />
      </div>
      <p class="text-center text-md2-caption text-md-text-disabled">加载中…</p>
    </div>

    <!-- 课表主体（绑定移动端触摸滑动事件） -->
    <div
      v-else
      class="overflow-hidden touch-pan-y"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchCancel"
    >
      <!-- 星期与日期表头行 -->
      <div class="flex items-center pb-2">
        <!-- 左侧留白（对齐时间轴宽度） -->
        <div class="w-[44px] sm:w-[55px] shrink-0" />

        <!-- 7 天列头 -->
        <div class="flex-1 grid grid-cols-7 gap-1 text-center">
          <div v-for="day in columnDays" :key="day.dayOfWeek" class="min-w-0">
            <div
              :class="[
                'text-[12px] leading-tight',
                day.isToday ? 'font-bold text-brand' : 'font-medium text-zinc-500 dark:text-zinc-400',
              ]"
            >
              {{ day.weekdayName }}
            </div>
            <div class="mt-1">
              <div
                v-if="day.isToday"
                class="w-7 h-7 rounded-full bg-brand text-white font-bold text-xs sm:text-sm flex items-center justify-center mx-auto shadow-xs"
              >
                {{ day.dayNum || '·' }}
              </div>
              <div
                v-else
                class="w-7 h-7 flex items-center justify-center font-semibold text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 mx-auto"
              >
                {{ day.dayNum || '\u00a0' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 切页动画容器 -->
      <div
        class="transition-transform duration-200 ease-out"
        :style="touchTransformStyle"
      >
        <div class="flex items-start">
          <!-- 左侧时间轴（6 个大节） -->
          <div class="w-[44px] sm:w-[55px] shrink-0 flex flex-col select-none">
            <div
              v-for="(slot, idx) in TIME_SLOTS"
              :key="idx"
              class="w-full flex flex-col items-center justify-start py-1"
              :style="{
                height: SECTION_HEIGHT + 'px',
                marginBottom: (idx < TIME_SLOTS.length - 1 ? GAP : 0) + 'px',
              }"
            >
              <!-- 上课开始时间 -->
              <span class="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 tabular-nums leading-tight">
                {{ slot.start }}
              </span>

              <!-- 是否显示下课时间：由设置项决定 -->
              <span
                v-if="effectiveShowEndTime"
                class="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums leading-tight mt-auto pb-0.5"
              >
                {{ slot.end }}
              </span>
            </div>
          </div>

          <!-- 右侧 7 列课程卡片网格 -->
          <div
            class="flex-1 relative"
            :style="{ height: TOTAL_GRID_HEIGHT + 'px' }"
          >
            <!-- 背景网格（极淡的参考点位） -->
            <div class="absolute inset-0 grid grid-cols-7 gap-1 pointer-events-none">
              <div
                v-for="i in 7"
                :key="i"
                class="h-full border-r border-zinc-100/60 dark:border-zinc-800/40 last:border-r-0"
              />
            </div>

            <!-- 空状态提示（整周无课） -->
            <div
              v-if="renderedCourses.length === 0"
              class="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <span class="text-xs text-zinc-400 dark:text-zinc-500 font-medium">本周暂无课程</span>
            </div>

            <!-- 课程卡片列表 -->
            <div
              v-for="item in renderedCourses"
              :key="item.key"
              class="absolute transition-transform duration-150 cursor-pointer active:scale-[0.98]"
              :style="item.style"
              :title="`${item.course.name} ${item.course.classroom} ${item.course.teacher}`"
              @click="openCourseDetail(item.course, item.conflicts)"
            >
              <div
                :class="[
                  'w-full h-full rounded-[6px] p-1 sm:p-1.5 flex flex-col justify-start overflow-hidden relative shadow-xs transition-opacity',
                  item.hasConflict ? 'border border-white/40 shadow-sm' : '',
                  isDimmed(item.course) ? 'opacity-30' : 'opacity-100',
                ]"
                :style="{ backgroundColor: item.color }"
              >
                <!-- 课程名称 -->
                <div class="text-white text-[10px] sm:text-[11px] font-bold leading-[1.15] line-clamp-3 break-all">
                  {{ item.course.name }}
                </div>

                <!-- 上课教室 -->
                <div
                  v-if="item.course.classroom"
                  class="text-white/90 text-[9px] sm:text-[10px] leading-[1.1] line-clamp-3 break-all mt-0.5"
                >
                  {{ item.course.classroom }}
                </div>

                <!-- 冲突图标：两层菱形/图层标志 -->
                <div
                  v-if="item.hasConflict"
                  class="absolute bottom-0.5 right-0.5 text-white/80"
                  title="该时段存在多门课程冲突，点击查看"
                >
                  <Icon name="layers" size="xs" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 课程详情弹窗（支持多门冲突课程切换） ============ -->
    <div
      v-if="selectedCourse"
      class="md-scrim flex items-center justify-center p-4 z-50"
      @click.self="selectedCourse = null"
    >
      <div class="md-dialog max-w-sm w-full">
        <div class="md-dialog-header">
          <div class="min-w-0 flex-1">
            <!-- 冲突课程切换条 -->
            <div
              v-if="activeConflicts.length > 1"
              class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-1"
            >
              <button
                v-for="(c, idx) in activeConflicts"
                :key="idx"
                type="button"
                :class="[
                  'px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition',
                  selectedCourse.name === c.name && selectedCourse.classroom === c.classroom
                    ? 'bg-brand text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200',
                ]"
                @click="selectedCourse = c"
              >
                {{ c.name }}
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
              <span class="md-chip-neutral">
                星期{{ WEEKDAY_CHARS[selectedCourse.dayOfWeek - 1] }} ·
                {{ periodRangeLabel(selectedCourse.startPeriod, selectedCourse.endPeriod) }}
              </span>
              <span v-if="selectedCourse.ruleTag === 'rescheduled'" class="md-chip-warning">已调课</span>
              <span v-else-if="selectedCourse.ruleTag === 'custom'" class="md-chip-success">加课</span>
            </div>
            <h3 class="md-dialog-title mt-2 truncate">{{ selectedCourse.name }}</h3>
          </div>

          <button
            class="md-icon-btn-sm shrink-0 -mt-1 -mr-1"
            title="关闭"
            type="button"
            @click="selectedCourse = null"
          >
            <Icon name="close" size="sm" />
          </button>
        </div>

        <div class="md-dialog-body space-y-2.5">
          <div class="flex items-baseline gap-2">
            <span class="text-md2-caption text-md-text-medium w-16 shrink-0">上课时间</span>
            <span class="text-md2-body2 tabular-nums text-md-text-high">{{ courseTimeRange(selectedCourse) }}</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-md2-caption text-md-text-medium w-16 shrink-0">上课教室</span>
            <span class="text-md2-body2 text-md-text-high font-medium">{{ selectedCourse.classroom || '未定' }}</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-md2-caption text-md-text-medium w-16 shrink-0">任课教师</span>
            <span class="text-md2-body2 text-md-text-high">{{ selectedCourse.teacher || '未定' }}</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-md2-caption text-md-text-medium w-16 shrink-0">授课周次</span>
            <span class="text-md2-body2 tabular-nums text-md-text-high">{{ selectedCourse.weeks }}</span>
          </div>

          <!-- 自定义颜色选项 -->
          <div class="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div class="text-xs text-zinc-500 mb-1.5 flex items-center justify-between">
              <span>自定义课程颜色</span>
              <span
                class="w-3.5 h-3.5 rounded-full inline-block border border-black/10"
                :style="{ backgroundColor: getCourseColor(selectedCourse.name) }"
              />
            </div>
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              <button
                v-for="hex in MATERIAL_700_PALETTE"
                :key="hex"
                type="button"
                class="w-5 h-5 rounded-full shrink-0 border border-white dark:border-zinc-800 transition transform hover:scale-110 active:scale-95 shadow-xs"
                :style="{ backgroundColor: hex }"
                :title="hex"
                @click="onPickCourseColor(selectedCourse.name, hex)"
              />
            </div>
          </div>
        </div>

        <div class="md-dialog-actions">
          <button class="md-btn-text" type="button" @click="selectedCourse = null">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import type { TimetableCourse, TimetableWeek } from '@/api/academic';
import { settings } from '@/stores/settings';
import { sectionTime } from '@/utils/ics';

const props = withDefaults(
  defineProps<{
    timetable: TimetableWeek | null;
    currentWeek: number;
    realWeek?: number;
    /** 第一周周一（yyyy-mm-dd），用于日期推算兜底 */
    firstWeekMonday?: string | null;
    /** 顶部搜索词：命中的高亮，其他淡出 */
    query?: string;
    loading?: boolean;
    /** 是否显示下课时间（缺省时读取 settings.timetableShowEndTime） */
    showEndTime?: boolean;
    /** 是否处于 PC 宽屏模式（由屏幕宽度判定） */
    isPc?: boolean;
  }>(),
  {
    realWeek: undefined,
    firstWeekMonday: null,
    query: '',
    loading: false,
    showEndTime: undefined,
    isPc: false,
  },
);

const emit = defineEmits<{
  (e: 'change-week', week: number): void;
  (e: 'update:currentWeek', week: number): void;
}>();

// ---------------------------------------------------------------------------
// 基础常量与尺寸
// ---------------------------------------------------------------------------

const WEEKDAY_CHARS = ['一', '二', '三', '四', '五', '六', '日'];

/** 6 个大节的时段定义（与原版 DateCalculator.getSectionTime 完全对齐） */
const TIME_SLOTS = [
  { start: '08:00', end: '09:40', periods: [1, 2] },
  { start: '10:05', end: '11:45', periods: [3, 4] },
  { start: '14:30', end: '16:10', periods: [5, 6] },
  { start: '16:35', end: '18:15', periods: [7, 8] },
  { start: '19:30', end: '21:10', periods: [9, 10] },
  { start: '21:20', end: '23:00', periods: [11, 12] },
] as const;

const SECTION_HEIGHT = 100;
const GAP = 4;
const TOTAL_GRID_HEIGHT = 6 * SECTION_HEIGHT + 5 * GAP;

/**
 * Material UI 19 种颜色的 700 色阶（严格与原版 CourseColorUtils 对齐）
 */
const MATERIAL_700_PALETTE = [
  '#303F9F', // Indigo 700
  '#E64A19', // Deep Orange 700
  '#00796B', // Teal 700
  '#C2185B', // Pink 700
  '#1976D2', // Blue 700
  '#FFA000', // Amber 700
  '#7B1FA2', // Purple 700
  '#388E3C', // Green 700
  '#D32F2F', // Red 700
  '#0097A7', // Cyan 700
  '#F57C00', // Orange 700
  '#512DA8', // Deep Purple 700
  '#689F38', // Light Green 700
  '#0288D1', // Light Blue 700
  '#5D4037', // Brown 700
  '#AFB42B', // Lime 700
  '#455A64', // Blue Grey 700
  '#FBC02D', // Yellow 700
  '#616161', // Grey 700
];

// ---------------------------------------------------------------------------
// 响应式下课时间开关（由设置项控制）
// ---------------------------------------------------------------------------

const effectiveShowEndTime = computed(() => {
  if (typeof props.showEndTime === 'boolean') return props.showEndTime;
  return settings.timetableShowEndTime;
});

// ---------------------------------------------------------------------------
// 自定义课程颜色缓存与反应式版本号
// ---------------------------------------------------------------------------

const colorVersion = ref(0);

function getCourseColor(name: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  colorVersion.value; // 建立反应式依赖

  if (!name) return MATERIAL_700_PALETTE[0];

  try {
    const raw = localStorage.getItem('custom_course_colors');
    if (raw) {
      const map = JSON.parse(raw);
      const val = map[name];
      if (typeof val === 'number') {
        return '#' + (val & 0x00ffffff).toString(16).padStart(6, '0');
      }
      if (typeof val === 'string' && val.startsWith('#')) {
        return val;
      }
    }
  } catch {}

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return MATERIAL_700_PALETTE[Math.abs(hash) % MATERIAL_700_PALETTE.length];
}

function onPickCourseColor(name: string, hex: string) {
  try {
    const raw = localStorage.getItem('custom_course_colors');
    const map = raw ? JSON.parse(raw) : {};
    map[name] = hex;
    localStorage.setItem('custom_course_colors', JSON.stringify(map));
    colorVersion.value++;
  } catch {}
}

// ---------------------------------------------------------------------------
// 日期与今天高亮计算
// ---------------------------------------------------------------------------

interface ColumnDay {
  dayOfWeek: number;
  weekdayName: string;
  dayNum: string;
  isToday: boolean;
}

const columnDays = computed<ColumnDay[]>(() => {
  const datesFromApi: Record<number, string> = {};
  for (const item of props.timetable?.dates ?? []) {
    if (item?.weekday && item?.date) {
      datesFromApi[Number(item.weekday)] = item.date;
    }
  }

  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth();
  const todayD = now.getDate();
  const todayWeekday = now.getDay() === 0 ? 7 : now.getDay();

  let parsedMonday: Date | null = null;
  if (props.firstWeekMonday) {
    const parts = props.firstWeekMonday.split('-');
    if (parts.length === 3) {
      parsedMonday = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
  }

  return [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => {
    let dayNum = '';
    let isToday = false;

    // 1. 服务端下发的日期
    const apiDate = datesFromApi[dayOfWeek];
    if (apiDate) {
      const parts = apiDate.slice(0, 10).split('-');
      if (parts.length === 3) {
        const y = Number(parts[0]);
        const m = Number(parts[1]) - 1;
        const d = Number(parts[2]);
        dayNum = String(d);
        isToday = y === todayY && m === todayM && d === todayD;
      }
    }

    // 2. 第一周周一推算
    if (!dayNum && parsedMonday) {
      const target = new Date(parsedMonday.getTime());
      target.setDate(target.getDate() + (props.currentWeek - 1) * 7 + (dayOfWeek - 1));
      dayNum = String(target.getDate());
      isToday =
        target.getFullYear() === todayY &&
        target.getMonth() === todayM &&
        target.getDate() === todayD;
    }

    // 3. 自然周降级匹配
    if (!isToday && !dayNum && props.realWeek === props.currentWeek) {
      isToday = todayWeekday === dayOfWeek;
      dayNum = isToday ? String(todayD) : '';
    }

    return {
      dayOfWeek,
      weekdayName: `周${WEEKDAY_CHARS[dayOfWeek - 1]}`,
      dayNum,
      isToday,
    };
  });
});

// ---------------------------------------------------------------------------
// 课程布局与冲突排序
// ---------------------------------------------------------------------------

function areCoursesOverlapping(a: TimetableCourse, b: TimetableCourse): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod;
}

/** 冲突层级：有教室 > 无教室；时长短（顶层）> 时长长（底层） */
function compareLayers(a: TimetableCourse, b: TimetableCourse): number {
  const aHasRoom = Boolean(a.classroom?.trim());
  const bHasRoom = Boolean(b.classroom?.trim());
  if (aHasRoom !== bHasRoom) return aHasRoom ? 1 : -1;

  const aDuration = a.endPeriod - a.startPeriod + 1;
  const bDuration = b.endPeriod - b.startPeriod + 1;
  if (aDuration !== bDuration) return bDuration - aDuration;

  const startDiff = a.startPeriod - b.startPeriod;
  if (startDiff !== 0) return startDiff;
  return a.name.localeCompare(b.name);
}

interface RenderedCourseItem {
  key: string;
  course: TimetableCourse;
  color: string;
  hasConflict: boolean;
  conflicts: TimetableCourse[];
  style: Record<string, string>;
}

const renderedCourses = computed<RenderedCourseItem[]>(() => {
  const courses = props.timetable?.courses ?? [];
  if (courses.length === 0) return [];

  const sorted = [...courses].sort(compareLayers);

  return sorted.map((course, layerIndex) => {
    const colIndex = Math.max(0, Math.min(6, course.dayOfWeek - 1));
    const bigSectionIndex = Math.min(5, Math.max(0, Math.floor((course.startPeriod - 1) / 2)));
    const periodDuration = Math.max(1, course.endPeriod - course.startPeriod + 1);
    const bigSectionSpan = Math.min(6 - bigSectionIndex, Math.max(1, Math.ceil(periodDuration / 2)));

    const top = bigSectionIndex * (SECTION_HEIGHT + GAP) + 1;
    const height = bigSectionSpan * SECTION_HEIGHT + (bigSectionSpan - 1) * GAP - 2;

    const leftPercent = (colIndex / 7) * 100;
    const widthPercent = (1 / 7) * 100;

    const conflicts = sorted.filter((other) => areCoursesOverlapping(course, other));
    const hasConflict = conflicts.length > 1;

    return {
      key: `${course.name}-${course.dayOfWeek}-${course.startPeriod}-${course.classroom}-${layerIndex}`,
      course,
      color: getCourseColor(course.name),
      hasConflict,
      conflicts,
      style: {
        left: `calc(${leftPercent}% + 1px)`,
        width: `calc(${widthPercent}% - 2px)`,
        top: `${top}px`,
        height: `${height}px`,
        zIndex: String(10 + layerIndex),
      },
    };
  });
});

// ---------------------------------------------------------------------------
// 搜索词命中判断
// ---------------------------------------------------------------------------

function matchesQuery(course: TimetableCourse): boolean {
  const q = (props.query ?? '').trim().toLowerCase();
  if (!q) return false;
  return `${course.name} ${course.teacher} ${course.classroom}`.toLowerCase().includes(q);
}

function isDimmed(course: TimetableCourse): boolean {
  return (props.query ?? '').trim().length > 0 && !matchesQuery(course);
}

// ---------------------------------------------------------------------------
// 课程详情弹窗
// ---------------------------------------------------------------------------

const selectedCourse = ref<TimetableCourse | null>(null);
const activeConflicts = ref<TimetableCourse[]>([]);

function openCourseDetail(course: TimetableCourse, conflicts: TimetableCourse[]) {
  selectedCourse.value = course;
  activeConflicts.value = conflicts.length > 0 ? conflicts : [course];
}

function periodRangeLabel(startPeriod: number, endPeriod: number): string {
  return `${startPeriod}-${endPeriod} 节`;
}

function courseTimeRange(course: TimetableCourse): string {
  try {
    const s = sectionTime(course.startPeriod).start;
    const e = sectionTime(course.endPeriod).end;
    return `${s} - ${e}`;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 移动端手势翻页（按自然周切换）
// ---------------------------------------------------------------------------

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isTouchActive = false;
const touchOffset = ref(0);

const touchTransformStyle = computed(() => {
  if (touchOffset.value === 0) return {};
  return {
    transform: `translateX(${touchOffset.value}px)`,
  };
});

function onTouchStart(e: TouchEvent) {
  if (props.isPc || e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartTime = Date.now();
  isTouchActive = true;
  touchOffset.value = 0;
}

function onTouchMove(e: TouchEvent) {
  if (!isTouchActive || e.touches.length !== 1) return;
  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const dx = currentX - touchStartX;
  const dy = currentY - touchStartY;

  // 仅在横向位移占优时阻尼预览滑动
  if (Math.abs(dx) > Math.abs(dy) * 1.2) {
    touchOffset.value = dx * 0.35; // 阻尼拖拽感
  }
}

function onTouchEnd(e: TouchEvent) {
  if (!isTouchActive) return;
  isTouchActive = false;
  const dx = touchOffset.value;
  touchOffset.value = 0;

  const touch = e.changedTouches[0];
  if (!touch) return;
  const totalDx = touch.clientX - touchStartX;
  const totalDy = touch.clientY - touchStartY;
  const elapsed = Date.now() - touchStartTime;

  // 必须是显著横向手势，避免打扰纵向滑动滚动
  if (Math.abs(totalDx) > Math.abs(totalDy) * 1.2) {
    const threshold = elapsed < 300 ? 30 : 50;
    if (totalDx < -threshold) {
      // 左滑 -> 下一周
      if (props.currentWeek < 20) {
        onGoToWeek(props.currentWeek + 1);
      }
    } else if (totalDx > threshold) {
      // 右滑 -> 上一周
      if (props.currentWeek > 1) {
        onGoToWeek(props.currentWeek - 1);
      }
    }
  }
}

function onTouchCancel() {
  isTouchActive = false;
  touchOffset.value = 0;
}

function onGoToWeek(week: number) {
  if (week >= 1 && week <= 20 && week !== props.currentWeek) {
    emit('change-week', week);
    emit('update:currentWeek', week);
  }
}
</script>
