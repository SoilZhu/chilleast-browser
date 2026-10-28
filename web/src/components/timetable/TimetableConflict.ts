/**
 * 冲突课程纯逻辑
 * ----------------------------------------------------------------------------
 * 逐条移植原版 Flutter App `lib/features/timetable/widgets/weekly_calendar_view.dart`
 * 里的三个静态方法（compareCourseLayers / areCoursesOverlapping / 冲突收集）。
 *
 * 语义要点：同一天、节次区间有交集的两门课算「冲突」，周视图里它们会叠放在
 * 同一个位置（后绘制的盖在上面），点开时用弹窗在几门课之间切换查看。
 *
 * 纯函数：不依赖 Vue、不读全局状态，方便单测。
 */

import type { TimetableCourse } from '@/api/academic';

/** 课程占用的节次数（时长） */
function durationOf(course: TimetableCourse): number {
  return course.endPeriod - course.startPeriod + 1;
}

/**
 * 冲突层级排序（原版 `compareCourseLayers`）。
 *
 * 返回值升序 = 绘制顺序：排在**后面**的层级更高、盖在上面。
 *   1. 有教室的层级更高（教室信息更具体，用户更想看到）
 *   2. 时长更短的层级更高（短课不遮住长课，避免长课被切成碎片）
 *   3. 兜底：startPeriod 升序；再兜底按 name 稳定排序
 *      （原版兜底用 id，网页端 TimetableCourse 没有 id，用 name + 教室代替）
 */
export function compareCourseLayers(a: TimetableCourse, b: TimetableCourse): number {
  // 1. 教室优先：有教室的排在后面 → 层级更高
  const aHasRoom = (a.classroom ?? '').trim() !== '';
  const bHasRoom = (b.classroom ?? '').trim() !== '';
  if (aHasRoom !== bHasRoom) return aHasRoom ? 1 : -1;

  // 2. 时长优先：时长更短的排在后面 → 层级更高
  const aDuration = durationOf(a);
  const bDuration = durationOf(b);
  if (aDuration !== bDuration) return bDuration - aDuration;

  // 3. 兜底稳定排序
  if (a.startPeriod !== b.startPeriod) return a.startPeriod - b.startPeriod;
  if (a.endPeriod !== b.endPeriod) return a.endPeriod - b.endPeriod;
  const nameCompare = (a.name ?? '').localeCompare(b.name ?? '', 'zh-CN');
  if (nameCompare !== 0) return nameCompare;
  return (a.classroom ?? '').localeCompare(b.classroom ?? '', 'zh-CN');
}

/**
 * 判定两门课程是否冲突（原版 `areCoursesOverlapping`）：
 * 同一天 且 节次区间有交集。
 */
export function areCoursesOverlapping(a: TimetableCourse, b: TimetableCourse): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod;
}

/**
 * 找出与 `course` 同一天且节次重叠的全部课程（含它自己），按层级升序。
 *
 * 调用方拿到长度 > 1 就说明有冲突：最后一个层级最高，点击时默认打开它所在的
 * 冲突弹窗。返回数组长度恒 ≥ 1（`course` 不在 `courses` 里时也至少含它自己）。
 */
export function conflictsOf(
  courses: readonly TimetableCourse[],
  course: TimetableCourse,
): TimetableCourse[] {
  const matched = courses.filter((other) => areCoursesOverlapping(course, other));

  // 传入的课程不在列表里（例如从周视图外部调用）时，至少把它自己带上
  const containsSelf = matched.some(
    (other) =>
      other === course ||
      (other.name === course.name &&
        other.dayOfWeek === course.dayOfWeek &&
        other.startPeriod === course.startPeriod &&
        other.endPeriod === course.endPeriod &&
        (other.classroom ?? '') === (course.classroom ?? '')),
  );
  if (!containsSelf) matched.push(course);

  return matched.sort(compareCourseLayers);
}

/**
 * 判断某门课在给定课程集合里是否有冲突（快捷方法）。
 * 周视图/日程视图用它决定要不要加 `layers` 角标与「冲突」徽标。
 */
export function hasConflict(courses: readonly TimetableCourse[], course: TimetableCourse): boolean {
  return courses.some((other) => other !== course && areCoursesOverlapping(course, other));
}

/** 课程身份键：同一门课的多次出现要能区分开（用于 v-for :key 与选中态比较） */
export function courseKey(course: TimetableCourse): string {
  return [
    course.dayOfWeek,
    course.startPeriod,
    course.endPeriod,
    course.name,
    course.classroom ?? '',
    course.teacher ?? '',
    course.weeks,
  ].join('|');
}
