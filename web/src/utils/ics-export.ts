/**
 * 课表 ICS 导出（浏览器下载）
 * ----------------------------------------------------------------------------
 * 网页端没有原版 App 的 `IcsExportHelper.saveAndShareIcs`（分享面板），
 * 对应的网页等价物是「Blob + a[download] 触发下载」。
 *
 * 这里抽出「算第一周周一 → 收集课程 → 生成 ICS → 触发下载」的完整链路，
 * 供两处复用：
 *   1. 课表页工具栏的「导出 ICS」快捷按钮（TimetableView.vue）
 *   2. 设置页「导出课表 (.ics)」行（settings/TimetableSettings.vue）
 */

import type { FullTimetableResponse, TimetableCourse } from '../api/academic';
import { storage } from './storage';
import { settings } from '../stores/settings';
import { generateIcs } from './ics';
import { courseKey } from '../components/timetable/TimetableConflict';

/** 导出文件名（与原版 App 分享时给的文件名一致） */
export const ICS_FILE_NAME = '湖南农业大学课表.ics';

/** 导出结果：ok=false 时 message 是可以直接展示给用户的文案 */
export interface IcsExportResult {
  ok: boolean;
  message: string;
}

/** 'yyyy-mm-dd' → 本地 Date（非法返回 null） */
function parseIsoDate(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 读取全量课表缓存（1-20 周 + 云端调课规则）。
 * 读不到或结构异常时返回 null。
 */
export function readCachedFullTimetable(): FullTimetableResponse | null {
  const raw = storage.getFullTimetable() as FullTimetableResponse | null;
  if (!raw || typeof raw !== 'object' || !raw.weeks || typeof raw.weeks !== 'object') return null;
  return raw;
}

/**
 * 从全量课表里收集**去重后**的课程列表。
 *
 * 全量课表的 `weeks[n].courses` 是按周过滤后的结果，同一门课会在它上课的每一周
 * 各出现一次。课程对象本身仍带着完整的 `weeks` 字符串，所以按课程身份去重即可
 * 还原出「一份课程清单」，交给 `generateIcs` 按周次分组生成事件。
 */
export function collectCourses(full: FullTimetableResponse | null): TimetableCourse[] {
  if (!full?.weeks) return [];

  const seen = new Set<string>();
  const courses: TimetableCourse[] = [];
  for (const week of Object.values(full.weeks)) {
    for (const course of week?.courses ?? []) {
      if (!course || typeof course.name !== 'string') continue;
      const key = courseKey(course);
      if (seen.has(key)) continue;
      seen.add(key);
      courses.push(course);
    }
  }
  return courses;
}

/**
 * 推算第一周周一，优先级与原版一致：
 *   1. 用户在「课表设置」里手动指定的 `manualFirstWeekMonday`
 *   2. 全量课表里第 1 周的 `dates`（服务端给的该周真实日期）
 *   3. 都没有 → null（调用方提示「暂无课表数据」）
 */
export function resolveFirstWeekMonday(full?: FullTimetableResponse | null): Date | null {
  const manual = settings.manualFirstWeekMonday;
  if (manual) {
    const parsed = parseIsoDate(manual);
    if (parsed) return parsed;
  }

  const source = full === undefined ? readCachedFullTimetable() : full;
  const weekOneDates = source?.weeks?.[1]?.dates ?? [];
  // dates 里 weekday '1' 是周一；取不到就退化成数组第一项
  const monday =
    weekOneDates.find((item) => String(item?.weekday) === '1')?.date ?? weekOneDates[0]?.date;
  if (!monday) return null;

  const parsed = parseIsoDate(monday);
  return parsed;
}

/** 触发浏览器下载（用完立即 revoke，避免占内存） */
function downloadTextFile(content: string, fileName: string): void {
  // BOM 让 Excel / Windows 日历正确识别 UTF-8 中文
  const blob = new Blob(['\uFEFF', content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // 立刻 revoke 会让部分浏览器来不及开始下载，延后一拍更稳
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 生成并下载课表 ICS。
 *
 * 失败（无课表 / 无第一周周一 / 课程为空）时返回可展示的文案，不抛异常 ——
 * 与网页端其它数据操作的「静默失败 + 文案提示」风格保持一致。
 */
export function exportTimetableIcs(): IcsExportResult {
  const full = readCachedFullTimetable();
  const courses = collectCourses(full);
  if (courses.length === 0) {
    return { ok: false, message: '暂无课表数据' };
  }

  const firstWeekMonday = resolveFirstWeekMonday(full);
  if (!firstWeekMonday) {
    return { ok: false, message: '暂无课表数据' };
  }

  try {
    const ics = generateIcs(courses, firstWeekMonday);
    downloadTextFile(ics, ICS_FILE_NAME);
    return { ok: true, message: '已导出课表' };
  } catch {
    return { ok: false, message: '导出失败，请稍后重试' };
  }
}
