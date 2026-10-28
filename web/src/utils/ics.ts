/**
 * ICS（iCalendar）生成与周次/节次工具
 * ----------------------------------------------------------------------------
 * 移植自原版 Flutter App：
 *   - `lib/features/timetable/utils/ics_generator.dart`（生成规则逐条对齐）
 *   - `lib/features/timetable/utils/ics_parser.dart`（周次/节次语义）
 *   - `lib/features/timetable/utils/date_calculator.dart`（节次时间表、日期推算）
 *
 * 与现成的 `components/timetable/section-time.ts` 的区别：那份是**界面近似值**
 * （08:00-09:35 之类），这里用的是原版教务系统的**权威节次时间表**
 * （08:00-08:45 … 22:15-23:00）。ICS 必须用权威值，否则导入日历后每节课
 * 的起止时间都会偏移，与原版 App 导出的课表对不上。
 *
 * 全部是纯函数：不碰 DOM、不读 localStorage、不发网络请求。
 */

import type { TimetableCourse } from '../api/academic';

/** 单节课的起止时刻，'HH:mm' */
export interface SectionTime {
  start: string;
  end: string;
}

/**
 * 节次时间表（原版 `DateCalculator.getSectionTime` 的原值，勿改）
 *
 * 1-2 节 08:00-09:40 / 3-4 节 10:05-11:45 / 5-6 节 14:30-16:10 /
 * 7-8 节 16:35-18:15 / 9-10 节 19:30-21:10 / 11-12 节 21:20-23:00
 */
const SECTION_TIMES: Record<number, SectionTime> = {
  1: { start: '08:00', end: '08:45' },
  2: { start: '08:55', end: '09:40' },
  3: { start: '10:05', end: '10:50' },
  4: { start: '11:00', end: '11:45' },
  5: { start: '14:30', end: '15:15' },
  6: { start: '15:25', end: '16:10' },
  7: { start: '16:35', end: '17:20' },
  8: { start: '17:30', end: '18:15' },
  9: { start: '19:30', end: '20:15' },
  10: { start: '20:25', end: '21:10' },
  11: { start: '21:20', end: '22:05' },
  12: { start: '22:15', end: '23:00' },
};

/** 大节（1-2 / 3-4 / …）的显示时间范围，供周视图左侧节次列使用 */
export const BIG_SECTION_TIMES: ReadonlyArray<{ label: string; time: string }> = [
  { label: '1-2', time: '08:00\n09:40' },
  { label: '3-4', time: '10:05\n11:45' },
  { label: '5-6', time: '14:30\n16:10' },
  { label: '7-8', time: '16:35\n18:15' },
  { label: '9-10', time: '19:30\n21:10' },
];

/**
 * 节次 → 上课时刻（与原版 `DateCalculator.getSectionTime` 一致）。
 * 超出 1-12 范围时返回 00:00，与原版的兜底行为一致。
 */
export function sectionTime(period: number): SectionTime {
  return SECTION_TIMES[period] ?? { start: '00:00', end: '00:00' };
}

/**
 * 解析周次字符串。
 *
 * 支持原版教务系统与云端备份里出现的全部写法：
 *   「1-16周」「1-8,10-16周」「1,3,5周」「1-16周(单)」「1-16周(双)」
 *   「1-10(周)」「第1-16周」「1-16周（单）」
 *
 * 返回去重、升序的周次数组；解析失败返回空数组。
 */
export function parseWeeks(weeks: string): number[] {
  if (!weeks) return [];

  let text = String(weeks).replace(/\s+/g, '');
  if (text === '') return [];

  // ---- 单双周标记：1-16周(单) / 1-16周（双）/ 1-16单周 ----
  let parity: 'odd' | 'even' | null = null;
  if (/[（(]单[)）]|单周/.test(text)) parity = 'odd';
  else if (/[（(]双[)）]|双周/.test(text)) parity = 'even';

  text = text
    .replace(/[（(](?:单|双)[)）]/g, '')
    .replace(/(?:单|双)周/g, '')
    .replace(/[（(]周[)）]/g, '')
    .replace(/周/g, '')
    .replace(/第/g, '')
    .replace(/[;；]/g, ',')
    .replace(/[，、]/g, ',');

  const collected = new Set<number>();
  for (const rawPart of text.split(',')) {
    const part = rawPart.trim();
    if (part === '') continue;

    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      let start = Number.parseInt(range[1], 10);
      let end = Number.parseInt(range[2], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start > end) [start, end] = [end, start];
      for (let week = start; week <= end; week++) collected.add(week);
      continue;
    }

    const single = Number.parseInt(part, 10);
    if (Number.isFinite(single)) collected.add(single);
  }

  let result = [...collected].filter((week) => Number.isFinite(week) && week > 0).sort((a, b) => a - b);
  if (parity === 'odd') result = result.filter((week) => week % 2 === 1);
  else if (parity === 'even') result = result.filter((week) => week % 2 === 0);
  return result;
}

// ---------------------------------------------------------------------------
// 日期工具
// ---------------------------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Date → 'YYYYMMDD' */
function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

/** Date（本地时间）→ ICS 'YYYYMMDDTHHmmss' */
function formatDateTime(date: Date): string {
  return `${formatDateOnly(date)}T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

/** Date（已转 UTC）→ ICS 'YYYYMMDDTHHmmssZ' */
function formatDateTimeUtc(date: Date): string {
  return `${formatDateOnly(date)}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

/** 把任意日期归一到它所在周的周一（原版 calculateDate 的强制归一化） */
function normalizeToMonday(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/**
 * 第 weekNumber 周、星期 dayOfWeek 的具体日期（原版 `DateCalculator.calculateDate`）。
 * 星期：1=周一 … 7=周日；超出范围按 7 取模回绕。
 */
function courseDate(monday: Date, weekNumber: number, dayOfWeek: number): Date {
  const weekday = (((Math.trunc(dayOfWeek) - 1) % 7) + 7) % 7 + 1;
  const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
  date.setDate(date.getDate() + (weekNumber - 1) * 7 + (weekday - 1));
  return date;
}

// ---------------------------------------------------------------------------
// ICS 文本转义
// ---------------------------------------------------------------------------

/**
 * RFC5545 TEXT 转义：反斜杠、分号、逗号、换行。
 *
 * 原版没做转义，这里补上是为了让课程名/教室里的中文标点不会把 ICS 结构撑坏。
 * 换行统一先压成空格：DESCRIPTION 的多行结构沿用原版的「真实换行」写法
 * （见下方 `buildDescription`），否则原版 `IcsParser` 的续行收集会读错。
 */
function escapeText(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, ' ');
}

// ---------------------------------------------------------------------------
// 周次分组 / UID
// ---------------------------------------------------------------------------

/** 把升序周次切成连续段： [1,2,3,5,7,8] → [[1,2,3],[5],[7,8]] */
function groupConsecutiveWeeks(weeks: readonly number[]): number[][] {
  if (weeks.length === 0) return [];
  const groups: number[][] = [];
  let current: number[] = [weeks[0]];

  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i] === weeks[i - 1] + 1) {
      current.push(weeks[i]);
    } else {
      groups.push(current);
      current = [weeks[i]];
    }
  }
  groups.push(current);
  return groups;
}

/** 32 位字符串散列（djb2），用于生成稳定的 UID */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * 生成 UID。
 *
 * 原版用 `DateTime.now().millisecondsSinceEpoch` 拼 UID，每次生成都变，
 * 导致重新上传订阅文件后日历里会出现**重复事件**。这里改成基于课程身份的
 * 稳定散列，重复生成得到同一 UID，日历端才会就地更新而不是新增。
 * 结构仍是原版的 `course-<hash>-w<week>@hunau.edu.cn`，原版可正常解析。
 */
function buildUid(course: TimetableCourse, suffix: string): string {
  const identity = [
    course.name,
    course.teacher,
    course.classroom,
    course.dayOfWeek,
    course.startPeriod,
    course.endPeriod,
    course.weeks,
  ].join('|');
  return `course-${hashString(identity)}-${suffix}@hunau.edu.cn`;
}

/** 课程描述（教师 / 周次 / 教室），与原版 `_generateDescription` 逐行一致 */
function buildDescription(course: TimetableCourse, startWeek: number, endWeek?: number): string[] {
  const lines: string[] = [];
  const teacher = (course.teacher ?? '').trim();
  if (teacher !== '') lines.push(`教师：${escapeText(teacher)}`);

  lines.push(endWeek !== undefined ? `周次：第${startWeek}-${endWeek}周` : `周次：第${startWeek}周`);

  const classroom = (course.classroom ?? '').trim();
  if (classroom !== '') lines.push(`教室：${escapeText(classroom)}`);
  return lines;
}

/** VEVENT 的公共头尾字段（原版字段顺序，原版 IcsParser 依赖这个顺序收 DESCRIPTION） */
function buildEventLines(options: {
  uid: string;
  dtstamp: string;
  start: Date;
  end: Date;
  rrule?: string;
  course: TimetableCourse;
  startWeek: number;
  endWeek?: number;
}): string[] {
  const { uid, dtstamp, start, end, rrule, course, startWeek, endWeek } = options;
  const classroom = (course.classroom ?? '').trim();

  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatDateTime(start)}`,
    `DTEND:${formatDateTime(end)}`,
  ];
  if (rrule) lines.push(`RRULE:${rrule}`);

  lines.push(
    `SUMMARY:${escapeText(course.name)}`,
    // 原版：classroom ?? '未知教室'，空串也走「未知教室」
    `LOCATION:${escapeText(classroom !== '' ? classroom : '未知教室')}`,
  );

  const description = buildDescription(course, startWeek, endWeek);
  if (description.length > 0) {
    // 多行 DESCRIPTION：首行跟在 DESCRIPTION: 后面，其余行按原版的「真实换行」写法
    lines.push(`DESCRIPTION:${description[0]}`);
    for (let i = 1; i < description.length; i++) lines.push(description[i]);
  }

  lines.push(
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:课程提醒',
    'END:VALARM',
    'END:VEVENT',
  );

  return lines;
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 生成 ICS 文本（对齐原版 `IcsGenerator.generate`）。
 *
 * - 连续周次用 `RRULE:FREQ=WEEKLY;COUNT=n` 合并成一个事件；
 * - 单周（或孤立周）各自生成独立事件；
 * - 日期时间用**浮动时间**（不带 TZID），靠 `X-WR-TIMEZONE:Asia/Shanghai` 说明时区，
 *   与原版一致；`DTSTAMP` 按 RFC 用 UTC。
 *
 * @param courses 课程列表
 * @param firstWeekMonday 本学期第一周的周一（传任意一天都会被归一到周一）
 */
export function generateIcs(courses: TimetableCourse[], firstWeekMonday: Date): string {
  const monday = normalizeToMonday(firstWeekMonday);
  const dtstamp = formatDateTimeUtc(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Live@HUNAU//Timetable//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:湖南农业大学课表',
    'X-WR-TIMEZONE:Asia/Shanghai',
  ];

  for (const course of courses) {
    const weeks = parseWeeks(course.weeks);
    if (weeks.length === 0) continue;

    for (const group of groupConsecutiveWeeks(weeks)) {
      const firstWeek = group[0];
      const day = courseDate(monday, firstWeek, course.dayOfWeek);
      const startSection = sectionTime(course.startPeriod);
      const endSection = sectionTime(course.endPeriod);

      const [startHour, startMinute] = startSection.start.split(':').map(Number);
      const [endHour, endMinute] = endSection.end.split(':').map(Number);

      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour, startMinute, 0);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), endHour, endMinute, 0);

      if (group.length === 1) {
        lines.push(
          ...buildEventLines({
            uid: buildUid(course, `w${firstWeek}`),
            dtstamp,
            start,
            end,
            course,
            startWeek: firstWeek,
          }),
        );
      } else {
        lines.push(
          ...buildEventLines({
            uid: buildUid(course, `w${firstWeek}-${group.length}`),
            dtstamp,
            start,
            end,
            rrule: `FREQ=WEEKLY;COUNT=${group.length}`,
            course,
            startWeek: firstWeek,
            endWeek: group[group.length - 1],
          }),
        );
      }
    }
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\n')}\n`;
}
