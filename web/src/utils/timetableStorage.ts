import type { FullTimetableResponse, TimetableCourse, TimetableWeek } from '../api/academic';

/**
 * 课表本地缓存管理（对齐原版 App 的 lib/features/timetable/services/timetable_storage.dart）
 *
 * 手机端用 File (courses.json / raw_courses.json / current_timetable.ics / timetable_meta.json / timetable_rules.json)
 * 网页端用 localStorage (相同语义键名)，保证离线可用、秒开、不依赖每次联网。
 */

export const FULL_TIMETABLE_KEY = 'chilleast_full_timetable';
export const TIMETABLE_PREFIX = 'chilleast_timetable_w_';
export const COURSES_KEY = 'chilleast_courses';
export const RAW_COURSES_KEY = 'chilleast_raw_courses';
export const RULES_KEY = 'chilleast_timetable_rules';
export const META_KEY = 'chilleast_timetable_meta';
export const ICS_KEY = 'chilleast_current_timetable_ics';

export interface TimetableMetadata {
  semester?: string;
  firstWeekMonday?: string;
  savedAt?: string;
}

export const timetableStorage = {
  /** 检查本地是否存在课表数据（对应 hasLocalTimetable） */
  hasLocalTimetable(): boolean {
    const full = this.getFullTimetable();
    if (full && full.weeks && Object.keys(full.weeks).length > 0) {
      return true;
    }
    const courses = this.readCourseList();
    return courses.length > 0;
  },

  /** 读取全量课表缓存（包含 1-20 周、当前周、规则与备份信息） */
  getFullTimetable(): FullTimetableResponse | null {
    const raw = localStorage.getItem(FULL_TIMETABLE_KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && data.weeks) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  },

  /** 保存全量课表（并自动拆解提取课程列表、元数据、单周缓存落地，保证子模块快速读取） */
  setFullTimetable(data: FullTimetableResponse): void {
    if (!data) return;
    try {
      localStorage.setItem(FULL_TIMETABLE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('保存全量课表缓存失败:', e);
    }

    // 提取并保存扁平课程列表
    const allCourses: TimetableCourse[] = [];
    const seen = new Set<string>();
    if (data.weeks) {
      for (const [wStr, weekObj] of Object.entries(data.weeks)) {
        const wNum = Number(wStr);
        if (weekObj?.courses) {
          for (const c of weekObj.courses) {
            const key = `${c.name}|${c.teacher}|${c.classroom}|${c.dayOfWeek}|${c.startPeriod}|${c.endPeriod}|${c.weeks}`;
            if (!seen.has(key)) {
              seen.add(key);
              allCourses.push(c);
            }
          }
        }
        // 同步写入单周缓存
        if (weekObj) {
          try {
            localStorage.setItem(`${TIMETABLE_PREFIX}${wNum}`, JSON.stringify(weekObj));
          } catch {}
        }
      }
    }
    if (allCourses.length > 0) {
      try {
        localStorage.setItem(COURSES_KEY, JSON.stringify(allCourses));
      } catch {}
    }

    // 保存元数据（开学第一周周一与学期）
    let firstWeekMonday: string | undefined;
    const weekOneDates = data.weeks?.[1]?.dates;
    if (Array.isArray(weekOneDates)) {
      const mondayItem = weekOneDates.find((d) => String(d.weekday) === '1');
      firstWeekMonday = mondayItem?.date;
    }
    const meta: TimetableMetadata = {
      semester: 'default',
      firstWeekMonday,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch {}

    // 如果包含云端备份规则，同步更新到本地规则
    if (Array.isArray(data.backup?.rules)) {
      try {
        localStorage.setItem(RULES_KEY, JSON.stringify(data.backup!.rules));
      } catch {}
    }
  },

  /** 读取单周课表缓存 */
  getCachedTimetable(week: number): TimetableWeek | null {
    const full = this.getFullTimetable();
    if (full?.weeks?.[week]) {
      return full.weeks[week];
    }
    const raw = localStorage.getItem(`${TIMETABLE_PREFIX}${week}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  /** 保存单周课表缓存 */
  setCachedTimetable(week: number, data: TimetableWeek): void {
    try {
      localStorage.setItem(`${TIMETABLE_PREFIX}${week}`, JSON.stringify(data));
    } catch {}
  },

  /** 读取课程列表（对应 readCourseList） */
  readCourseList(): TimetableCourse[] {
    const raw = localStorage.getItem(COURSES_KEY);
    if (raw) {
      try {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      } catch {}
    }
    // 兜底：从 fullTimetable 中提取
    const full = this.getFullTimetable();
    if (!full?.weeks) return [];
    const allCourses: TimetableCourse[] = [];
    const seen = new Set<string>();
    for (const weekObj of Object.values(full.weeks)) {
      if (weekObj?.courses) {
        for (const c of weekObj.courses) {
          const key = `${c.name}|${c.teacher}|${c.classroom}|${c.dayOfWeek}|${c.startPeriod}|${c.endPeriod}|${c.weeks}`;
          if (!seen.has(key)) {
            seen.add(key);
            allCourses.push(c);
          }
        }
      }
    }
    return allCourses;
  },

  /** 保存课程列表（对应 saveCourseList） */
  saveCourseList(courses: TimetableCourse[]): void {
    try {
      localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
    } catch {}
  },

  /** 删除本地课表（对应 deleteTimetable / deleteCourseList：清除课表但保留规则与手动周一） */
  deleteLocalTimetable(): void {
    localStorage.removeItem(FULL_TIMETABLE_KEY);
    localStorage.removeItem(COURSES_KEY);
    localStorage.removeItem(RAW_COURSES_KEY);
    localStorage.removeItem(ICS_KEY);
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(TIMETABLE_PREFIX)) {
        stale.push(key);
      }
    }
    for (const key of stale) {
      localStorage.removeItem(key);
    }
  },

  /** 读取课表元数据（对应 readMetadata） */
  readMetadata(): TimetableMetadata | null {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  /** 保存课表元数据（对应 saveMetadata） */
  saveMetadata(meta: TimetableMetadata): void {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch {}
  },

  /** 删除元数据 */
  deleteMetadata(): void {
    localStorage.removeItem(META_KEY);
  },

  /** 读取本地调课规则（对应 readRules） */
  readRules(): any[] {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  /** 保存本地调课规则（对应 saveRules） */
  saveRules(rules: any[]): void {
    try {
      localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    } catch {}
  },

  /** 删除调课规则 */
  deleteRules(): void {
    localStorage.removeItem(RULES_KEY);
  },

  /** 退出登录时清除所有课表数据（对齐原版 auth_state.dart logout） */
  deleteAll(): void {
    this.deleteLocalTimetable();
    this.deleteMetadata();
    this.deleteRules();
  },
};
