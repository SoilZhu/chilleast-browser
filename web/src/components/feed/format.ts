/**
 * 首页信息流区块用到的格式化工具
 *
 * 区块组件只做展示，时间与配色的换算集中在这里，
 * 避免每个卡片各写一份。
 */

/** 节次时间表（与课表页一致：每小节 45 分钟，第 1 节 08:00 开始） */
const SECTION_TIME: Record<number, { start: string; end: string }> = {
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

/** 把节次区间换算成「08:00-09:40」这样的时段文本 */
export function periodRange(startPeriod: number, endPeriod: number): string {
  const start = SECTION_TIME[startPeriod]?.start;
  const end = SECTION_TIME[endPeriod]?.end;
  if (!start || !end) return `第 ${startPeriod}-${endPeriod} 节`;
  return `${start}-${end}`;
}

/** 某一节的下课时间（当天第几分钟），用于判断课程是否已结束 */
export function periodEndMinutes(period: number): number | null {
  const end = SECTION_TIME[period]?.end;
  if (!end) return null;
  const [h, m] = end.split(':').map(Number);
  return h * 60 + m;
}

/** 课程配色：Material 700 档，按课程名散列取色，同一门课颜色稳定 */
const COURSE_COLORS = [
  '#d32f2f',
  '#c2185b',
  '#7b1fa2',
  '#512da8',
  '#303f9f',
  '#1976d2',
  '#0288d1',
  '#0097a7',
  '#00796b',
  '#388e3c',
  '#689f38',
  '#afb42b',
  '#fbc02d',
  '#ffa000',
  '#f57c00',
  '#e64a19',
  '#5d4037',
  '#616161',
  '#455a64',
];

export function courseColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 宽松解析后端返回的时间串（`2026-10-26 08:00:00` / ISO / 时间戳） */export function parseTime(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const text = String(raw);
  const d = new Date(text.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `2026-10-26 23:59:00` → `10-26 23:59` */
export function shortDateTime(raw: unknown): string {
  const d = parseTime(raw);
  if (!d) return typeof raw === 'string' ? raw : '';
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 两个时间点拼成一段区间；解析失败的一端直接省略 */
export function timeRangeText(start: unknown, end: unknown): string {
  const a = shortDateTime(start);
  const b = shortDateTime(end);
  if (a && b) return `${a} ~ ${b}`;
  return a || b;
}

/**
 * 金额文本转数字。
 * 注意不能直接用 Number()：Number(null) 和 Number('') 都是 0，
 * 会把「没有数据」显示成「¥0.00」。空值一律返回 null。
 */
export function toAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
