/**
 * 节次时间表与课程配色（日程视图共用）
 *
 * 大节时间与 TimetableGrid 左侧节次列保持一致：
 * 1-2 节 08:00-09:35 / 3-4 节 10:05-11:40 / 5-6 节 14:00-15:35 /
 * 7-8 节 16:05-17:40 / 9-10 节 19:00-20:35
 */

export interface BigSection {
  /** 该大节包含的节次 */
  periods: number[];
  start: string;
  end: string;
}

const BIG_SECTIONS: BigSection[] = [
  { periods: [1, 2], start: '08:00', end: '09:35' },
  { periods: [3, 4], start: '10:05', end: '11:40' },
  { periods: [5, 6], start: '14:00', end: '15:35' },
  { periods: [7, 8], start: '16:05', end: '17:40' },
  { periods: [9, 10], start: '19:00', end: '20:35' },
];

function bigSectionOf(period: number): BigSection | undefined {
  return BIG_SECTIONS.find((s) => s.periods.includes(period));
}

/** 节次标签，如「1-2 节」；节次超出时间表时给空串，由调用方兜底 */
export function periodLabel(startPeriod: number, endPeriod: number): string {
  const start = bigSectionOf(startPeriod);
  const end = bigSectionOf(endPeriod) ?? start;
  if (!start || !end) return '';
  return `${start.periods[0]}-${end.periods[end.periods.length - 1]} 节`;
}

/**
 * 上课时间
 * showEndTime 为 false 时只给开始时间（对应设置项「显示下课时间」关闭）
 */
export function courseTime(startPeriod: number, endPeriod: number, showEndTime: boolean): string {
  const start = bigSectionOf(startPeriod);
  if (!start) return '';
  if (!showEndTime) return start.start;
  const end = bigSectionOf(endPeriod) ?? start;
  return `${start.start}-${end.end}`;
}

/** 课程配色：同一门课始终同色（与周视图一致，按课程名散列取色） */
export interface CourseTone {
  /** 4px 左侧色条 */
  bar: string;
  /** 浅色底（节次标签底色） */
  tint: string;
  /** 深色文字 */
  text: string;
}

const COURSE_TONES: CourseTone[] = [
  { bar: '#09C489', tint: '#e6f9f3', text: '#06845d' },
  { bar: '#1a73e8', tint: '#e8f0fe', text: '#185abc' },
  { bar: '#7b1fa2', tint: '#f3e8fd', text: '#681da8' },
  { bar: '#f29900', tint: '#fef7e0', text: '#a56600' },
  { bar: '#d93025', tint: '#fce8e6', text: '#b3261e' },
  { bar: '#00897b', tint: '#e0f2f1', text: '#00695c' },
  { bar: '#3949ab', tint: '#e8eaf6', text: '#283593' },
];

export function courseTone(name: string): CourseTone {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return COURSE_TONES[Math.abs(hash) % COURSE_TONES.length];
}
