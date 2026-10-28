<template>
  <!-- ===================================================================
       日程视图（对应 App 的 tabAgenda）
       -------------------------------------------------------------------
       按真实日期分组的时间轴：左侧日期栏（星期 + 日期数字）+ 右侧卡片列表。
       每天的卡片顺序与原版 `_buildAgendaDaySection` 一致：**先考试、再作业、最后课程**。

       三种卡片的形态来自原版，各有一套语言：
         · 课程 → 课程色**纯色填充 + 白字**（`_buildCourseAgendaCard`）
         · 考试 → 浅红底 + 红描边 + quiz 图标（`_buildExamAgendaTask`）
         · 作业 → 浅黄底 + assignment_late 图标（`_buildHomeworkAgendaTask`）

       日程视图**不表达冲突**：同一时段的多门课各自平铺一行，不做叠放、
       不做角标、不可点击弹窗 —— 那是周视图的职责。
       =================================================================== -->
  <div class="space-y-4">
    <!-- 加载骨架 -->
    <div v-if="loading && !timetable" class="space-y-3" aria-busy="true" aria-label="日程加载中">
      <div v-for="i in 3" :key="i" class="flex gap-3">
        <div class="w-11 shrink-0 space-y-1.5">
          <div class="md-skeleton h-3 w-8" />
          <div class="md-skeleton h-9 w-9 rounded-full" />
        </div>
        <div class="min-w-0 flex-1 space-y-2">
          <div class="md-skeleton h-14 w-full rounded-md2-sm" />
          <div class="md-skeleton h-14 w-full rounded-md2-sm" />
        </div>
      </div>
      <p class="text-center text-md2-caption text-md-text-disabled">加载中…</p>
    </div>

    <!-- 空状态 -->
    <EmptyState v-else-if="days.length === 0" text="本周暂无安排" icon="calendar" />

    <!-- 按日期分组的时间轴（单列：宽屏时与周视图并排，每栏本来就窄） -->
    <div v-else class="space-y-5">
      <section v-for="day in days" :key="day.iso">
        <div class="flex items-start gap-3">
          <!-- 左侧日期栏：星期名 + 圆形日期数字（今天主色填充），对齐原版 -->
          <div class="w-11 shrink-0 text-center">
            <div
              :class="[
                'text-[13px] leading-4',
                day.isToday ? 'font-bold text-md-primary' : 'text-md-text-medium',
              ]"
            >
              {{ day.weekdayName }}
            </div>
            <div
              :class="[
                'mx-auto mt-1 flex h-9 w-9 items-center justify-center rounded-full text-[17px] font-bold tabular-nums',
                day.isToday ? 'bg-md-primary text-white' : 'text-md-text-high',
              ]"
            >
              {{ day.dayOfMonth }}
            </div>
          </div>

          <!-- 右侧卡片列表：考试 → 作业 → 课程 -->
          <div class="min-w-0 flex-1 space-y-1">
            <!-- ============ 1. 考试（浅红底 + 红描边） ============ -->
            <div
              v-for="exam in day.exams"
              :key="`exam-${exam.key}`"
              class="rounded-md2-sm border border-red-500/20 bg-md-danger-surface px-4 py-2.5"
            >
              <div class="flex items-start gap-2.5">
                <Icon name="quiz" size="sm" class="mt-0.5 shrink-0 text-md-danger" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-start gap-1.5">
                    <span class="min-w-0 flex-1 text-[15px] font-bold leading-tight text-md-text-high line-clamp-2">
                      {{ exam.title }}
                    </span>
                    <span v-if="exam.status" class="md-chip-danger shrink-0">{{ exam.status }}</span>
                  </div>
                  <div class="mt-1 text-[12px] leading-4 text-md-text-medium line-clamp-1">
                    {{ exam.timeLine }}
                  </div>
                </div>
              </div>
            </div>

            <!-- ============ 2. 作业（浅黄底） ============ -->
            <div
              v-for="hw in day.homework"
              :key="`hw-${hw.id}`"
              class="rounded-md2-sm bg-md-warning-surface px-3 py-2.5"
            >
              <div class="flex items-start gap-2.5">
                <Icon name="assignment-late" size="sm" class="mt-0.5 shrink-0 text-md-warning" />
                <div class="min-w-0 flex-1">
                  <div class="text-[15px] font-bold leading-tight text-md-text-high line-clamp-1">
                    {{ hw.title }}
                  </div>
                  <div class="text-[12px] leading-4 text-md-text-medium line-clamp-1">
                    {{ hw.subtitle }}
                  </div>
                </div>
              </div>
            </div>

            <!-- ============ 3. 课程（纯色填充 + 白字，无 icon） ============ -->
            <div
              v-for="course in day.courses"
              :key="courseKey(course)"
              :class="[
                'rounded-md2-sm px-3.5 py-2 text-white transition-opacity duration-md2-short',
                isDimmed(course) ? 'opacity-40' : '',
                isHighlighted(course) ? 'ring-2 ring-inset ring-white/70' : '',
              ]"
              :style="{ backgroundColor: courseTone(course.name).bar }"
            >
              <div class="text-[15px] font-bold leading-tight line-clamp-1">{{ course.name }}</div>
              <!-- 时间、地点、老师：不加 icon，用「, 」分隔（与原版一致） -->
              <div class="mt-0.5 text-[12px] leading-4 text-white/90 line-clamp-1">
                {{ courseMeta(course) }}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@/components/Icon.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import type { TimetableCourse, TimetableWeek } from '@/api/academic';
import type { HomeworkItem } from '@/api/study';
import { sectionTime } from '@/utils/ics';
import { courseKey } from './TimetableConflict';
import { courseTone } from './section-time';

const props = withDefaults(
  defineProps<{
    timetable: TimetableWeek | null;
    currentWeek: number;
    realWeek?: number;
    /** 设置项「显示下课时间」：关闭时课程只给开始时间 */
    showEndTime: boolean;
    /** 顶部搜索框关键词：命中课程名 / 教师 / 教室 */
    query?: string;
    loading?: boolean;
    /** 未完成且有截止时间的作业（父级已过滤） */
    homework?: HomeworkItem[];
    /** 未开考的考试（父级已过滤） */
    exams?: any[];
    /** 第一周周一（yyyy-mm-dd），用于把「第 N 周星期 D」换算成真实日期 */
    firstWeekMonday?: string | null;
  }>(),
  {
    realWeek: undefined,
    query: '',
    loading: false,
    homework: () => [],
    exams: () => [],
    firstWeekMonday: null,
  },
);

// ---------------------------------------------------------------------------
// 日期工具
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + n);
  return next;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 当前查看周的周一。
 * 优先级：firstWeekMonday → timetable.dates 里 weekday=1 的日期反推 → null
 */
const mondayOfWeek = computed<Date | null>(() => {
  const manual = props.firstWeekMonday;
  if (manual) {
    const d = new Date(`${manual.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return startOfDay(d);
  }
  const firstDay = props.timetable?.dates?.find((x) => String(x.weekday) === '1')?.date;
  if (!firstDay) return null;
  const d = new Date(`${firstDay.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
});

/** 本周第 D 天（1-7）的日期；完全没有日期信息时为 null */
function dateOfDay(dayOfWeek: number): Date | null {
  const monday = mondayOfWeek.value;
  if (!monday) return null;
  return addDays(monday, dayOfWeek - 1);
}

const todayIso = isoOf(new Date());

// ---------------------------------------------------------------------------
// 作业 / 考试的时间解析
// ---------------------------------------------------------------------------

/** 作业截止时间戳（毫秒），解析不出来返回 null */
function homeworkTime(item: HomeworkItem): number | null {
  const raw = item.endTime;
  if (raw != null && String(raw).trim() !== '') {
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    const asDate = new Date(String(raw)).getTime();
    if (Number.isFinite(asDate)) return asDate;
  }
  const local = item.endTimeLocal;
  if (local && String(local).trim() !== '' && local !== '无截止时间') {
    const t = new Date(local).getTime();
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** 考试开始时间戳（毫秒），解析不出来返回 null */
function examTime(exam: any): number | null {
  const raw = exam?.timeMs ?? exam?.time ?? exam?.timeLocal;
  if (raw === undefined || raw === null || raw === '') return null;
  const t = typeof raw === 'number' ? raw : new Date(String(raw)).getTime();
  return Number.isFinite(t) ? t : null;
}

/** 已结束的考试不再挂到日程上（原版 isPendingOrUnfinished 的口径） */
function isFinishedExam(exam: any): boolean {
  const status = String(exam?.status || '').trim();
  return status.includes('已完成') || status.includes('已结束');
}

/** 'HH:mm' */
function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// 按日期分组
// ---------------------------------------------------------------------------

interface AgendaExamItem {
  key: string;
  title: string;
  status: string;
  /** 「09:00 @ 十教北 201」 */
  timeLine: string;
}

interface AgendaHomeworkItem {
  id: string;
  title: string;
  /** 「《形势与政策5》· 截止 23:59」 */
  subtitle: string;
}

interface AgendaDay {
  iso: string;
  weekdayName: string;
  dayOfMonth: number;
  isToday: boolean;
  exams: AgendaExamItem[];
  homework: AgendaHomeworkItem[];
  courses: TimetableCourse[];
}

/** 考试标题：课程名 · 考试名（与原版 displayTitle 一致） */
function examTitle(exam: any): string {
  const course = String(exam?.courseName || '').trim();
  const title = String(exam?.title || '').trim();
  if (course) return title && title !== course ? `${course} · ${title}` : course;
  return title || '考试';
}

/** 考试的第二行：时间 @ 地点（原版 timeLocation） */
function examTimeLine(exam: any, ms: number): string {
  const location = String(exam?.location || '').trim();
  const time = hhmm(ms);
  return location ? `${time} @ ${location}` : time;
}

/** 作业的第二行：课程名 · 截止 HH:mm（原版 '课程 · 截止 HH:mm'） */
function homeworkSubtitle(item: HomeworkItem, ms: number): string {
  const deadline = `截止 ${hhmm(ms)}`;
  const course = String(item.courseName || '').trim();
  return course ? `${course} · ${deadline}` : deadline;
}

/**
 * 7 天的日程分组。
 *
 * 课程按 dayOfWeek 挂；作业与考试按**真实日期**挂 —— 所以必须有日期基准。
 * 完全拿不到日期时（没有 firstWeekMonday 也没有 dates），退化成
 * 「只按星期分课程，作业/考试挂在今天那一栏」，至少不丢数据也不崩。
 */
const days = computed<AgendaDay[]>(() => {
  const courses = props.timetable?.courses ?? [];
  const hasDate = mondayOfWeek.value !== null;
  const todayWeekday = new Date().getDay() === 0 ? 7 : new Date().getDay();

  // 先把作业/考试按日期串归桶，避免 7×N 次重复解析
  const homeworkByDate = new Map<string, AgendaHomeworkItem[]>();
  for (const item of props.homework ?? []) {
    const ms = homeworkTime(item);
    if (ms === null) continue;
    const key = isoOf(new Date(ms));
    const bucket = homeworkByDate.get(key) ?? [];
    bucket.push({ id: item.id, title: item.title, subtitle: homeworkSubtitle(item, ms) });
    homeworkByDate.set(key, bucket);
  }

  const examsByDate = new Map<string, AgendaExamItem[]>();
  for (const exam of props.exams ?? []) {
    if (isFinishedExam(exam)) continue;
    const ms = examTime(exam);
    if (ms === null) continue;
    const key = isoOf(new Date(ms));
    const bucket = examsByDate.get(key) ?? [];
    bucket.push({
      key: `${exam?.id ?? exam?.title ?? ''}#${ms}`,
      title: examTitle(exam),
      status: String(exam?.status || '').trim() === '待考' ? '' : String(exam?.status || '').trim(),
      timeLine: examTimeLine(exam, ms),
    });
    examsByDate.set(key, bucket);
  }

  // 日期拿不到时，作业/考试统一落到今天那栏
  const fallbackKey = hasDate ? '' : todayIso;

  const result: AgendaDay[] = [];
  for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek++) {
    const date = dateOfDay(dayOfWeek);
    const iso = date ? isoOf(date) : '';

    const dayCourses = courses
      .filter((c) => c.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod);

    const dateKey = date ? iso : fallbackKey;
    const isFallbackToday = !hasDate && dayOfWeek === todayWeekday;

    const exams = (examsByDate.get(dateKey) ?? []).slice();
    const homework = (homeworkByDate.get(dateKey) ?? []).slice();

    // 整栏空就不渲染（与原版一致：没有内容的日期不进时间轴）
    if (dayCourses.length === 0 && exams.length === 0 && homework.length === 0) continue;

    result.push({
      iso: date ? iso : `w${dayOfWeek}`,
      weekdayName: WEEKDAY_NAMES[dayOfWeek - 1],
      dayOfMonth: date ? date.getDate() : dayOfWeek,
      isToday: date ? iso === todayIso : isFallbackToday,
      exams,
      homework,
      courses: dayCourses,
    });
  }

  return result;
});

// ---------------------------------------------------------------------------
// 课程卡片文字
// ---------------------------------------------------------------------------

/** 时间（受「显示下课时间」设置控制） */
function courseTimeText(course: TimetableCourse): string {
  const start = sectionTime(course.startPeriod).start;
  if (!props.showEndTime) return start;
  return `${start}-${sectionTime(course.endPeriod).end}`;
}

/** 「08:00-09:40, 十教北201, 张老师」—— 不加 icon，空值跳过 */
function courseMeta(course: TimetableCourse): string {
  return [courseTimeText(course), (course.classroom ?? '').trim(), (course.teacher ?? '').trim()]
    .filter((part) => part !== '')
    .join(', ');
}

// ---------------------------------------------------------------------------
// 搜索高亮
// ---------------------------------------------------------------------------

function matchesQuery(course: TimetableCourse): boolean {
  const q = (props.query ?? '').trim().toLowerCase();
  if (!q) return false;
  return `${course.name} ${course.teacher} ${course.classroom}`.toLowerCase().includes(q);
}

function isDimmed(course: TimetableCourse): boolean {
  return (props.query ?? '').trim().length > 0 && !matchesQuery(course);
}

function isHighlighted(course: TimetableCourse): boolean {
  return matchesQuery(course);
}
</script>
