/**
 * 课表调整规则的纯逻辑（前端镜像）
 * ----------------------------------------------------------------------------
 * 逐条镜像 `worker/src/school/hunau/timetable-rules.ts`：
 *   - parseWeeks / formatWeeks 与客户端 WeekParser、Worker 的实现保持同一套语义
 *   - buildRescheduleRule / buildSuspensionRule / buildCustomCourseRule 的
 *     **字段名必须与 Worker 逐字一致**，否则手机端 App 与 Worker 应用规则时会错
 *   - applyTimetableRules 是 Worker 那份的前端副本，只用于「保存前本地预演」，
 *     真正生效仍以服务端为准
 *
 * 与 Worker 的差异（有意为之）：
 *   - 这里额外提供 UI 需要的辅助：weekdayName / periodChoices / describeRule /
 *     summarize*，它们只影响显示，不参与数据落地
 *   - 本文件不碰 DOM、不读 localStorage、不发网络请求（纯函数，方便单测）
 */

import type { TimetableCourse } from '../api/academic';

// ---------------------------------------------------------------------------
// 类型（与 Worker 的 TimetableRule 逐字一致）
// ---------------------------------------------------------------------------

export type RuleType = 'reschedule' | 'suspension' | 'customCourse';

export interface TimetableRule {
  id: string;
  type: RuleType;
  description: string;
  createdAt: string;
  data: Record<string, unknown>;
}

/** 调课方式：复制 / 平移 / 对调 */
export type RescheduleAction = 'copy' | 'move' | 'swap';

const WEEKDAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 1 → 周一 … 7 → 周日（越界时给「周N」兜底） */
export function weekdayName(day: number): string {
  return WEEKDAY_NAMES[day] ?? `周${day}`;
}

/** 学期最大周次（与原版 App 的 1-25 下拉一致；课表本身按 1-20 展示） */
export const MAX_WEEK = 25;

/** 每天最大节次 */
export const MAX_PERIOD = 12;

// ---------------------------------------------------------------------------
// 周次字符串 <-> 周次数组（与客户端 WeekParser 一致）
// ---------------------------------------------------------------------------

/** "1-10(周)" / "1,3,5(周)" / "1-10,12-14(周)" -> [1,2,…] */
export function parseWeeks(weekString: string): number[] {
  const cleaned = weekString.replace(/\(周\)/g, '').replace(/\s+/g, '').trim();
  if (cleaned === '') return [];

  const weeks = new Set<number>();
  for (const rawPart of cleaned.split(',')) {
    const part = rawPart.trim();
    if (part === '') continue;

    if (part.includes('-')) {
      const bounds = part.split('-');
      if (bounds.length !== 2) continue;
      let start = Number.parseInt(bounds[0], 10);
      let end = Number.parseInt(bounds[1], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start > end) [start, end] = [end, start];
      for (let week = start; week <= end; week++) weeks.add(week);
    } else {
      const value = Number.parseInt(part, 10);
      if (Number.isFinite(value)) weeks.add(value);
    }
  }
  return [...weeks].sort((a, b) => a - b);
}

/** [1,2,3,5] -> "1-3,5(周)" */
export function formatWeeks(weeks: readonly number[]): string {
  const sorted = [...new Set(weeks)].filter((w) => Number.isFinite(w)).sort((a, b) => a - b);
  if (sorted.length === 0) return '(周)';

  const parts: string[] = [];
  let rangeStart = sorted[0];
  let previous = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current !== undefined && current === previous + 1) {
      previous = current;
      continue;
    }
    parts.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
    if (current !== undefined) {
      rangeStart = current;
      previous = current;
    }
  }
  return `${parts.join(',')}(周)`;
}

/**
 * 保存时用的周次字符串：`1-16(周)`。
 * 单周写成 `5(周)`（与 App 的 `'$startWeek(周)'` 一致），不做 "5-5" 这种冗余。
 */
export function weeksFromRange(startWeek: number, endWeek: number): string {
  const start = Math.min(startWeek, endWeek);
  const end = Math.max(startWeek, endWeek);
  return start === end ? `${start}(周)` : `${start}-${end}(周)`;
}

/** 节次字符串：`01-02`（与 Worker applyCustomCourse 的 periods 拼法一致） */
export function periodsFromRange(startPeriod: number, endPeriod: number): string {
  const start = Math.min(startPeriod, endPeriod);
  const end = Math.max(startPeriod, endPeriod);
  const pad = (v: number) => String(v).padStart(2, '0');
  return start === end ? pad(start) : `${pad(start)}-${pad(end)}`;
}

// ---------------------------------------------------------------------------
// 规则构造（字段名与 Worker 逐字一致）
// ---------------------------------------------------------------------------

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function buildSuspensionRule(input: {
  startWeek: number;
  endWeek: number;
  startDayOfWeek: number;
  endDayOfWeek: number;
  courseName?: string;
  startPeriod?: number;
  endPeriod?: number;
}): TimetableRule {
  const name = (input.courseName ?? '').trim();
  return {
    id: makeId('rule_suspension'),
    type: 'suspension',
    description:
      `停课：第${input.startWeek}-${input.endWeek}周 ` +
      `${weekdayName(input.startDayOfWeek)}-${weekdayName(input.endDayOfWeek)}` +
      (name === '' ? '' : `《${name}》`),
    createdAt: new Date().toISOString(),
    data: {
      startWeek: input.startWeek,
      endWeek: input.endWeek,
      startDayOfWeek: input.startDayOfWeek,
      endDayOfWeek: input.endDayOfWeek,
      ...(name === '' ? {} : { courseName: name }),
      ...(input.startPeriod === undefined ? {} : { startPeriod: input.startPeriod }),
      ...(input.endPeriod === undefined ? {} : { endPeriod: input.endPeriod }),
    },
  };
}

export function buildCustomCourseRule(input: {
  courseName: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  weeks: string;
  teacher?: string;
  classroom?: string;
}): TimetableRule {
  return {
    id: makeId('rule_custom'),
    type: 'customCourse',
    description:
      `加课：《${input.courseName}》${weekdayName(input.dayOfWeek)} ` +
      `第${input.startPeriod}-${input.endPeriod}节`,
    createdAt: new Date().toISOString(),
    data: {
      courseName: input.courseName,
      teacher: input.teacher ?? '',
      classroom: input.classroom ?? '',
      weeks: input.weeks,
      dayOfWeek: input.dayOfWeek,
      startPeriod: input.startPeriod,
      endPeriod: input.endPeriod,
    },
  };
}

export function buildRescheduleRule(input: {
  sourceWeek: number;
  targetWeek: number;
  sourceDayOfWeek: number;
  targetDayOfWeek: number;
  mode: RescheduleAction | string;
  courseName?: string;
  sourceStartPeriod?: number;
  sourceEndPeriod?: number;
  targetStartPeriod?: number;
  targetEndPeriod?: number;
}): TimetableRule {
  const name = (input.courseName ?? '').trim();
  const modeLabel = input.mode === 'copy' ? '（复制）' : input.mode === 'swap' ? '（对调）' : '（平移）';
  return {
    id: makeId('rule_reschedule'),
    type: 'reschedule',
    description:
      `${name === '' ? '' : `《${name}》`}第${input.sourceWeek}周${weekdayName(input.sourceDayOfWeek)}` +
      ` → 第${input.targetWeek}周${weekdayName(input.targetDayOfWeek)}${modeLabel}`,
    createdAt: new Date().toISOString(),
    data: {
      sourceWeek: input.sourceWeek,
      targetWeek: input.targetWeek,
      sourceDayOfWeek: input.sourceDayOfWeek,
      targetDayOfWeek: input.targetDayOfWeek,
      action: input.mode,
      ...(name === '' ? {} : { courseName: name }),
      ...(input.sourceStartPeriod === undefined ? {} : { sourceStartPeriod: input.sourceStartPeriod }),
      ...(input.sourceEndPeriod === undefined ? {} : { sourceEndPeriod: input.sourceEndPeriod }),
      ...(input.targetStartPeriod === undefined ? {} : { targetStartPeriod: input.targetStartPeriod }),
      ...(input.targetEndPeriod === undefined ? {} : { targetEndPeriod: input.targetEndPeriod }),
    },
  };
}

// ---------------------------------------------------------------------------
// 规则应用（Worker 逻辑的前端副本，仅用于本地预演）
// ---------------------------------------------------------------------------

function courseWeeks(course: TimetableCourse): number[] {
  return parseWeeks(course.weeks);
}

function withWeeks(course: TimetableCourse, weeks: readonly number[]): TimetableCourse {
  return { ...course, weeks: formatWeeks(weeks) };
}

function applyCustomCourse(courses: TimetableCourse[], rule: TimetableRule): TimetableCourse[] {
  const data = rule.data;
  const name = String(data['courseName'] ?? '').trim();
  if (name === '') return courses;

  const weeks = parseWeeks(String(data['weeks'] ?? '1-16(周)'));
  if (weeks.length === 0) return courses;

  const startPeriod = Number(data['startPeriod'] ?? 0);
  const endPeriod = Number(data['endPeriod'] ?? startPeriod) || startPeriod;

  return [
    ...courses,
    {
      name,
      teacher: String(data['teacher'] ?? ''),
      classroom: String(data['classroom'] ?? ''),
      dayOfWeek: Number(data['dayOfWeek'] ?? 1),
      startPeriod,
      endPeriod,
      periods:
        startPeriod > 0
          ? `${String(startPeriod).padStart(2, '0')}-${String(endPeriod).padStart(2, '0')}`
          : '',
      weeks: formatWeeks(weeks),
      ruleTag: 'custom',
    },
  ];
}

function applySuspension(courses: TimetableCourse[], rule: TimetableRule): TimetableCourse[] {
  const data = rule.data;
  const startWeek = Number(data['startWeek'] ?? 1);
  const endWeek = Number(data['endWeek'] ?? 25);
  const courseName = String(data['courseName'] ?? '').trim().toLowerCase();

  const singleDay = data['dayOfWeek'] === undefined ? null : Number(data['dayOfWeek']);
  const startDay = Number(data['startDayOfWeek'] ?? singleDay ?? 1);
  const endDay = Number(data['endDayOfWeek'] ?? singleDay ?? 7);

  const startPeriod = data['startPeriod'] === undefined ? null : Number(data['startPeriod']);
  const endPeriod = data['endPeriod'] === undefined ? null : Number(data['endPeriod']);

  const startKey = startWeek * 7 + startDay;
  const endKey = endWeek * 7 + endDay;

  const result: TimetableCourse[] = [];
  for (const course of courses) {
    if (courseName !== '' && !course.name.toLowerCase().includes(courseName)) {
      result.push(course);
      continue;
    }
    if (startPeriod !== null && endPeriod !== null) {
      const overlaps = !(course.endPeriod < startPeriod || course.startPeriod > endPeriod);
      if (!overlaps) {
        result.push(course);
        continue;
      }
    }

    const original = courseWeeks(course);
    const remaining = original.filter((week) => {
      const key = week * 7 + course.dayOfWeek;
      return key < startKey || key > endKey;
    });

    if (remaining.length === 0) continue; // 整门课都被停掉
    result.push(remaining.length === original.length ? course : withWeeks(course, remaining));
  }
  return result;
}

function applyReschedule(courses: TimetableCourse[], rule: TimetableRule): TimetableCourse[] {
  const data = rule.data;
  const sourceWeek = Number(data['sourceWeek'] ?? 0);
  const targetWeek = Number(data['targetWeek'] ?? 0);
  const sourceDay = Number(data['sourceDayOfWeek'] ?? 0);
  const targetDay = Number(data['targetDayOfWeek'] ?? 0);
  const courseName = String(data['courseName'] ?? '').trim().toLowerCase();
  const mode = String(data['action'] ?? (data['isSwap'] === true ? 'swap' : 'move'));
  const sourceStart = data['sourceStartPeriod'] === undefined ? null : Number(data['sourceStartPeriod']);
  const sourceEnd = data['sourceEndPeriod'] === undefined ? null : Number(data['sourceEndPeriod']);
  const targetStart = data['targetStartPeriod'] === undefined ? null : Number(data['targetStartPeriod']);
  const targetEnd = data['targetEndPeriod'] === undefined ? null : Number(data['targetEndPeriod']);

  const matchesSource = (course: TimetableCourse): boolean => {
    if (course.dayOfWeek !== sourceDay) return false;
    if (!courseWeeks(course).includes(sourceWeek)) return false;
    if (courseName !== '' && !course.name.toLowerCase().includes(courseName)) return false;
    if (sourceStart !== null && sourceEnd !== null) {
      const overlaps = !(course.endPeriod < sourceStart || course.startPeriod > sourceEnd);
      if (!overlaps) return false;
    }
    return true;
  };

  const moved: TimetableCourse[] = [];
  const kept: TimetableCourse[] = [];

  for (const course of courses) {
    if (!matchesSource(course)) {
      kept.push(course);
      continue;
    }

    const remainingWeeks = courseWeeks(course).filter((w) => w !== sourceWeek);
    if (mode === 'copy') {
      kept.push(course);
    } else if (remainingWeeks.length > 0) {
      kept.push({
        ...course,
        weeks: formatWeeks(remainingWeeks),
      });
    }

    const relocated: TimetableCourse = {
      ...course,
      dayOfWeek: targetDay > 0 ? targetDay : course.dayOfWeek,
      startPeriod: targetStart ?? course.startPeriod,
      endPeriod: targetEnd ?? targetStart ?? course.endPeriod,
      periods:
        targetStart !== null
          ? `${String(targetStart).padStart(2, '0')}-${String(targetEnd ?? targetStart).padStart(2, '0')}`
          : course.periods,
      weeks: formatWeeks([targetWeek]),
      ruleTag: 'rescheduled',
    };
    moved.push(relocated);
  }

  // swap：目标周/星期上的课程反向搬回源周/源星期
  if (mode === 'swap' && targetDay > 0) {
    const swapped: TimetableCourse[] = [];
    const targetKept: TimetableCourse[] = [];
    for (const course of kept) {
      const isTargetSide =
        course.dayOfWeek === targetDay &&
        courseWeeks(course).includes(targetWeek) &&
        (courseName === '' || course.name.toLowerCase().includes(courseName));
      if (!isTargetSide) {
        targetKept.push(course);
        continue;
      }
      const remainingTarget = courseWeeks(course).filter((w) => w !== targetWeek);
      if (remainingTarget.length > 0) {
        targetKept.push({
          ...course,
          weeks: formatWeeks(remainingTarget),
        });
      }
      swapped.push({
        ...course,
        dayOfWeek: sourceDay > 0 ? sourceDay : course.dayOfWeek,
        weeks: formatWeeks([sourceWeek]),
        ruleTag: 'rescheduled',
      });
    }
    return [...targetKept, ...swapped, ...moved];
  }

  return [...kept, ...moved];
}

/** 规则执行顺序固定：自定义加课 -> 调课 -> 停课。 */
export function applyTimetableRules(
  courses: readonly TimetableCourse[],
  rules: readonly TimetableRule[],
): TimetableCourse[] {
  if (rules.length === 0) return [...courses];

  let working = [...courses];
  for (const type of ['customCourse', 'reschedule', 'suspension'] as const) {
    for (const rule of rules.filter((item) => item.type === type)) {
      if (type === 'customCourse') working = applyCustomCourse(working, rule);
      else if (type === 'reschedule') working = applyReschedule(working, rule);
      else working = applySuspension(working, rule);
    }
  }
  return working;
}

/** 排序规则列表：加课 -> 调课 -> 停课，同类型保持原有相对顺序（与 App 的 sortRules 一致） */
export function sortRules(rules: readonly TimetableRule[]): TimetableRule[] {
  return [
    ...rules.filter((r) => r.type === 'customCourse'),
    ...rules.filter((r) => r.type === 'reschedule'),
    ...rules.filter((r) => r.type === 'suspension'),
  ];
}

// ---------------------------------------------------------------------------
// 显示辅助（只影响 UI，不参与数据落地）
// ---------------------------------------------------------------------------

/** 规则类型 → 中文名（与 App 的 ruleType* 文案一致） */
export const RULE_TYPE_LABEL: Record<RuleType, string> = {
  reschedule: '调休',
  suspension: '停课',
  customCourse: '加课',
};

/** 调课方式 → 一句话说明（与 App 的 reschedule*Desc 一致） */
export const ACTION_DESC: Record<RescheduleAction, string> = {
  copy: '原日期的课保留，目标日原本的课会被覆盖',
  move: '只把课挪过去，原日期的课不保留，目标日原本的课会被覆盖',
  swap: '两天的课程互相交换',
};

/** 调课方式 → 中文名 */
export const ACTION_LABEL: Record<RescheduleAction, string> = {
  copy: '复制',
  move: '平移',
  swap: '对调',
};

/**
 * 规则的一句话描述（对应 App 的 `getLocalizedDescription`）。
 * 优先按 data 现场拼（这样云端旧规则也能显示成本地文案），
 * 拼不出来时退回规则自带的 description。
 */
export function describeRule(rule: TimetableRule): string {
  const data = rule.data ?? {};
  try {
    if (rule.type === 'reschedule') {
      const sourceWeek = numOrNull(data['sourceWeek']);
      const targetWeek = numOrNull(data['targetWeek']);
      const sourceDay = numOrNull(data['sourceDayOfWeek']);
      const targetDay = numOrNull(data['targetDayOfWeek']);
      if (sourceWeek !== null && targetWeek !== null && sourceDay !== null && targetDay !== null) {
        const name = strOf(data['courseName']);
        const courseStr = name === '' ? '' : `《${name}》`;
        const sourceStr = `第${sourceWeek}周${weekdayName(sourceDay)}`;
        const targetStr = `第${targetWeek}周${weekdayName(targetDay)}`;
        const tStart = numOrNull(data['targetStartPeriod']);
        const tEnd = numOrNull(data['targetEndPeriod']);
        if (tStart !== null && tEnd !== null) {
          const sStart = numOrNull(data['sourceStartPeriod']);
          const sEnd = numOrNull(data['sourceEndPeriod']);
          const sPeriodStr = sStart !== null && sEnd !== null ? ` 第${sStart}-${sEnd}节` : '';
          return `${courseStr}${sourceStr}${sPeriodStr} → ${targetStr} 第${tStart}-${tEnd}节`;
        }
        const action = strOf(data['action']) || (data['isSwap'] === true ? 'swap' : 'move');
        const modeLabel = action === 'copy' ? '（复制）' : action === 'swap' ? '（对调）' : '（平移）';
        return `${courseStr}${sourceStr} → ${targetStr}${modeLabel}`;
      }
    }

    if (rule.type === 'suspension') {
      const startWeek = numOrNull(data['startWeek']);
      const endWeek = numOrNull(data['endWeek']);
      if (startWeek !== null && endWeek !== null) {
        const name = strOf(data['courseName']);
        const courseStr = name === '' ? '' : `《${name}》`;
        const startDay = numOrNull(data['startDayOfWeek']);
        const endDay = numOrNull(data['endDayOfWeek']);
        let rangeStr: string;
        if (startDay === null || endDay === null) {
          rangeStr = startWeek === endWeek ? `第${startWeek}周` : `第${startWeek}-${endWeek}周`;
        } else if (startWeek === endWeek && startDay === endDay) {
          rangeStr = `第${startWeek}周${weekdayName(startDay)}`;
        } else if (startWeek === endWeek) {
          rangeStr = `第${startWeek}周${weekdayName(startDay)}至${weekdayName(endDay)}`;
        } else {
          rangeStr = `第${startWeek}周${weekdayName(startDay)}至第${endWeek}周${weekdayName(endDay)}`;
        }
        const sPeriod = numOrNull(data['startPeriod']);
        const ePeriod = numOrNull(data['endPeriod']);
        const periodStr = sPeriod !== null && ePeriod !== null ? ` 第${sPeriod}-${ePeriod}节` : '';
        return `${courseStr}${rangeStr}${periodStr} 停课`;
      }
    }

    if (rule.type === 'customCourse') {
      const name = strOf(data['courseName']);
      if (name !== '') {
        const day = numOrNull(data['dayOfWeek']) ?? 1;
        const startPeriod = numOrNull(data['startPeriod']) ?? 1;
        const endPeriod = numOrNull(data['endPeriod']) ?? startPeriod;
        const weeks = strOf(data['weeks']);
        return `加课：${name}（${weekdayName(day)} 第${startPeriod}-${endPeriod}节 ${weeks}）`;
      }
    }
  } catch {
    // 数据形状异常时退回原始描述
  }
  return rule.description;
}

function numOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function strOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 单门调课的汇总文案（对应 App 的 courseSummaryText）：
 * `第3周《高等数学》：周三第1-2节 → 第5周周五第3-4节`
 */
export function summarizeReschedule(input: {
  sourceWeek: number;
  courseName: string;
  sourceDayOfWeek: number;
  sourceStartPeriod: number;
  sourceEndPeriod: number;
  targetWeek: number;
  targetDayOfWeek: number;
  targetStartPeriod: number;
  targetEndPeriod: number;
}): string {
  return (
    `第${input.sourceWeek}周《${input.courseName}》：` +
    `${weekdayName(input.sourceDayOfWeek)}第${input.sourceStartPeriod}-${input.sourceEndPeriod}节` +
    ` → 第${input.targetWeek}周${weekdayName(input.targetDayOfWeek)}` +
    `第${input.targetStartPeriod}-${input.targetEndPeriod}节`
  );
}

/** 整天调休的汇总文案：`第3周周三 全天 → 第5周周五（平移）` */
export function summarizeWholeDay(input: {
  sourceWeek: number;
  sourceDayOfWeek: number;
  targetWeek: number;
  targetDayOfWeek: number;
  action: RescheduleAction;
}): string {
  return (
    `第${input.sourceWeek}周${weekdayName(input.sourceDayOfWeek)} 全天` +
    ` → 第${input.targetWeek}周${weekdayName(input.targetDayOfWeek)}` +
    `（${ACTION_LABEL[input.action]}）`
  );
}

/** 停课汇总文案：`第3-5周 周一至周五《高等数学》 第1-2节 停课` */
export function summarizeSuspension(input: {
  startWeek: number;
  endWeek: number;
  startDayOfWeek: number;
  endDayOfWeek: number;
  courseName?: string;
  startPeriod?: number;
  endPeriod?: number;
}): string {
  const name = (input.courseName ?? '').trim();
  const weekStr =
    input.startWeek === input.endWeek ? `第${input.startWeek}周` : `第${input.startWeek}-${input.endWeek}周`;
  const dayStr =
    input.startDayOfWeek === input.endDayOfWeek
      ? weekdayName(input.startDayOfWeek)
      : `${weekdayName(input.startDayOfWeek)}至${weekdayName(input.endDayOfWeek)}`;
  const periodStr =
    input.startPeriod !== undefined && input.endPeriod !== undefined
      ? ` 第${input.startPeriod}-${input.endPeriod}节`
      : '';
  return `${weekStr} ${dayStr}${name === '' ? '' : `《${name}》`}${periodStr} 停课`;
}

/** 加课汇总文案：`《自习》周一 第1-2节 1-16(周)` */
export function summarizeCustomCourse(input: {
  courseName: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  weeks: string;
}): string {
  return `《${input.courseName}》${weekdayName(input.dayOfWeek)} 第${input.startPeriod}-${input.endPeriod}节 ${input.weeks}`;
}

// ---------------------------------------------------------------------------
// 课程下拉选项（调课/停课对话框共用）
// ---------------------------------------------------------------------------

/** 一门课在课表里的一个「时段」（同名的多段课各占一个） */
export interface CourseSlot {
  course: TimetableCourse;
  /** 该时段真正有课的周次（升序） */
  weeks: number[];
}

/** 按课程名分组，取全部去重后的课程名（升序，与原版 `map().toSet().toList()..sort()` 一致） */
export function courseNamesOf(courses: readonly TimetableCourse[]): string[] {
  return [...new Set(courses.map((c) => c.name).filter((n) => n !== ''))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
}

/** 某门课的全部时段（同名课程可能有多个） */
export function slotsOf(courses: readonly TimetableCourse[], courseName: string): CourseSlot[] {
  return courses
    .filter((c) => c.name === courseName)
    .map((course) => ({ course, weeks: parseWeeks(course.weeks) }));
}

/**
 * 时段下拉里的一行文案（对应 App 的 originalSlotFormat）：
 * `周三 第1-2节 (1-16(周))`
 */
export function slotLabel(slot: CourseSlot): string {
  const { course } = slot;
  return `${weekdayName(course.dayOfWeek)} 第${course.startPeriod}-${course.endPeriod}节 (${course.weeks})`;
}

/**
 * 调课「新节次」下拉的取值：0 = 保持原节次，其余是大节起始节次。
 * 与原版 periodChoiceNames 的键一致：0 / 1 / 3 / 5 / 7 / 9 / 11。
 */
export const PERIOD_CHOICES = [0, 1, 3, 5, 7, 9, 11] as const;

/** 新节次下拉的一行文案（对应 App 的 keepOriginalPeriod / periodTimeRange） */
export function periodChoiceLabel(choice: number): string {
  if (choice === 0) return '保持原节次';
  const start = choice;
  const end = choice + 1;
  const time = SECTION_START_TIME[start] ?? '';
  return time === '' ? `第${start}-${end}节` : `第${start}-${end}节 ${time}`;
}

/** 大节起始时刻（与原版 periodChoiceNames 里写死的时刻一致） */
const SECTION_START_TIME: Record<number, string> = {
  1: '08:00',
  3: '10:05',
  5: '14:30',
  7: '16:35',
  9: '19:30',
  11: '21:20',
};

/** 1..count 的整数数组（模板里避免手写 Array.from） */
export function range(count: number, start = 1): number[] {
  return Array.from({ length: count }, (_, i) => start + i);
}

/** 周次下拉的一行文案：`第3周 (本周)` */
export function weekLabel(week: number, currentWeek?: number): string {
  return week === currentWeek ? `第${week}周 (本周)` : `第${week}周`;
}
