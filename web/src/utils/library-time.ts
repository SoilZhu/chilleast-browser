/**
 * 图书馆预约的时间选择纯逻辑。
 * 对齐 ChillEast `lib/features/library/utils/library_time_utils.dart`。
 *
 * 全部按**北京时间（UTC+8）**计算 —— 服务器在超星侧、用户在学校，
 * 而浏览器可能跑在任何一个时区（本机实测就是 UTC+8 之外的时区），
 * 不能用 `new Date()` 的本地字段取「今天」。
 *
 * 实现方式与 Dart / Worker 完全一致：把「北京时间墙上时钟」当成 UTC 时刻来处理
 * （Dart 的 `getBeijingNow()` 返回的就是 UTC now + 8h 的 DateTime）。
 */

export const OPENING_HOUR = 7;
export const CLOSING_HOUR = 22;
export const INTERVAL_MINUTES = 30;

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 当前北京时间的「墙上时钟」（以 UTC 字段读取即为北京时间）。 */
export function beijingNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + BEIJING_OFFSET_MS);
}

/** 格式化为 YYYY-MM-DD（按北京时间）。 */
export function formatDate(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** 今天的日期字符串（北京时间）。 */
export function todayString(now: Date = new Date()): string {
  return formatDate(beijingNow(now));
}

/** 解析 YYYY-MM-DD 为 UTC 零点毫秒（即北京时间的当天零点）。 */
export function parseDay(day: string): number | null {
  const parts = day.split('-');
  if (parts.length !== 3) return null;
  const year = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10);
  const date = Number.parseInt(parts[2], 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(date)) return null;
  const value = Date.UTC(year, month - 1, date);
  const check = new Date(value);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== date
  ) {
    return null;
  }
  return value;
}

/**
 * 可预约的日期列表（按北京时间）：
 * - 只允许预约今明两天；
 * - 每天 22:00 之前只有今天，22:00 及之后才会出现明天。
 */
export function availableReserveDays(now: Date = new Date()): string[] {
  const beijing = beijingNow(now);
  const today = formatDate(beijing);
  if (beijing.getUTCHours() >= 22) {
    return [today, formatDate(new Date(beijing.getTime() + DAY_MS))];
  }
  return [today];
}

/**
 * 初始推荐预约日期：22:00 后默认明天；今天已无可用时段时自动切到明天；否则今天。
 */
export function initialReserveDay(now: Date = new Date()): string {
  const beijing = beijingNow(now);
  const today = formatDate(beijing);
  const tomorrow = formatDate(new Date(beijing.getTime() + DAY_MS));
  if (beijing.getUTCHours() >= 22) return tomorrow;
  if (availableStartSlots(today, now).length === 0) return tomorrow;
  return today;
}

/**
 * 用服务器返回的 ymd 校正日期：服务器日期与本地不一致时以服务器为准，
 * 再按「当前已无可用时段则顺延到明天」的规则收敛。
 */
export function resolveEffectiveDay(day: string, now: Date = new Date()): string {
  const beijing = beijingNow(now);
  const parsed = parseDay(day);
  const base = parsed === null ? formatDate(beijing) : day;
  const slots = availableStartSlots(base, now);
  if (beijing.getUTCHours() >= 22 || slots.length === 0) {
    return formatDate(new Date((parsed ?? Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate())) + DAY_MS));
  }
  return base;
}

/** 半小时刻度，含 22:00 作为最后的结束时间（07:00 … 22:00，共 31 个）。 */
export function buildTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = OPENING_HOUR; hour <= CLOSING_HOUR; hour++) {
    slots.push(`${pad2(hour)}:00`);
    if (hour < CLOSING_HOUR) slots.push(`${pad2(hour)}:30`);
  }
  return slots;
}

/** 解析「日期 + HH:mm」为可比较的毫秒（北京时间墙上时钟），非法返回 null。 */
export function dateTimeAt(day: string, time: string): number | null {
  const dayMs = parseDay(day);
  const parts = time.split(':');
  if (dayMs === null || parts.length < 2) return null;
  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return dayMs + hour * 60 * 60 * 1000 + minute * 60 * 1000;
}

/** 今天的开始时间必须严格晚于当前时刻；未来日期的所有营业时段均可选。 */
export function availableStartSlots(day: string, now: Date = new Date()): string[] {
  const current = beijingNow(now).getTime();
  const slots = buildTimeSlots();
  const result: string[] = [];
  for (let i = 0; i < slots.length - 1; i++) {
    const at = dateTimeAt(day, slots[i]);
    if (at !== null && at > current) result.push(slots[i]);
  }
  return result;
}

/**
 * 结束时间候选：营业时段里晚于当前时刻的所有刻度。
 * 与 Dart `candidateEndSlots` 一致 —— 只过滤「已经过去的时刻」，
 * 「是否晚于开始时间」由 UI 逐项禁用（见 `isEndSlotUsable`）。
 */
export function candidateEndSlots(day: string, now: Date = new Date()): string[] {
  const current = beijingNow(now).getTime();
  const slots = buildTimeSlots();
  return slots.filter((slot) => {
    const at = dateTimeAt(day, slot);
    return at !== null && at > current;
  });
}

/** 结束时间必须严格晚于开始时间。 */
export function isEndSlotUsable(startTime: string | null, endTime: string): boolean {
  if (startTime === null) return false;
  const slots = buildTimeSlots();
  const startIndex = slots.indexOf(startTime);
  const endIndex = slots.indexOf(endTime);
  return startIndex >= 0 && endIndex > startIndex;
}

/** 默认开始时间：明天优先 08:00，今天取最早可选刻度。 */
export function defaultStartTime(day: string, now: Date = new Date()): string | null {
  const available = availableStartSlots(day, now);
  if (available.length === 0) return null;
  if (day !== todayString(now) && available.includes('08:00')) return '08:00';
  return available[0];
}

/** 默认结束时间 = 开始时间 + 2 小时（4 个半小时刻度），越界取最后一个刻度。 */
export function defaultEndTime(startTime: string): string | null {
  const slots = buildTimeSlots();
  const startIndex = slots.indexOf(startTime);
  if (startIndex < 0 || startIndex >= slots.length - 1) return null;
  const endIndex = startIndex + 4 < slots.length ? startIndex + 4 : slots.length - 1;
  return endIndex > startIndex ? slots[endIndex] : null;
}

/** 校验一个预约时段：两端都必须是合法刻度、开始时间必须晚于此刻、结束晚于开始。 */
export function isValidRange(
  day: string,
  startTime: string,
  endTime: string,
  now: Date = new Date(),
): boolean {
  const start = dateTimeAt(day, startTime);
  const end = dateTimeAt(day, endTime);
  if (start === null || end === null) return false;
  const slots = buildTimeSlots();
  if (!slots.includes(startTime) || !slots.includes(endTime)) return false;
  if (start <= beijingNow(now).getTime()) return false;
  return end > start;
}

/** 日期标签，例如「今天 (10月27日)」「明天 (10月28日)」「周四 (10月29日)」。 */
export function formatDayLabel(day: string, now: Date = new Date()): string {
  const parsed = parseDay(day);
  if (parsed === null) return day;

  const beijing = beijingNow(now);
  const today = Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate());
  const diffDays = Math.round((parsed - today) / DAY_MS);

  const weekday = WEEKDAY_LABELS[new Date(parsed).getUTCDay()] ?? '';
  const monthDay = `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;

  if (diffDays === 0) return `今天 (${monthDay})`;
  if (diffDays === 1) return `明天 (${monthDay})`;
  return `${weekday} (${monthDay})`;
}

/** 把预约接口返回的 epoch 毫秒格式化成北京时间的 HH:mm。 */
export function formatEpochHHmm(epochMs: number | string): string {
  const n = Number(epochMs);
  if (!Number.isFinite(n) || n <= 0) return '';
  const beijing = beijingNow(new Date(n));
  return `${pad2(beijing.getUTCHours())}:${pad2(beijing.getUTCMinutes())}`;
}

/** 把预约接口返回的 epoch 毫秒格式化成北京时间的 YYYY-MM-DD。 */
export function formatEpochDay(epochMs: number | string): string {
  const n = Number(epochMs);
  if (!Number.isFinite(n) || n <= 0) return '';
  return formatDate(beijingNow(new Date(n)));
}

/** 时段时长文案：2 小时 → `2h`，0.5 小时 → `0.5h`。 */
export function durationText(startTime: string, endTime: string): string {
  const start = dateTimeAt('2000-01-01', startTime);
  const end = dateTimeAt('2000-01-01', endTime);
  if (start === null || end === null || end <= start) return '';
  const hours = (end - start) / 3_600_000;
  return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
}
