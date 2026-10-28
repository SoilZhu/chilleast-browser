import type { Env } from '../env';
import { fail, ok } from '../util/response';
import { extractBearerCredentials } from '../auth/token';
import { runWithSession } from '../auth/session-manager';
import {
  fetchScores,
  fetchSemesters,
  fetchTimetableWeek,
  fetchFullSemesterTimetable,
  deriveCurrentWeekFromDates,
  loginYdjwxt,
  type TimetableWeek,
} from '../school/hunau/ydjwxt';
import { applyTimetableRules, parseWeeks, type TimetableRule } from '../school/hunau/timetable-rules';
import { ensureCloudiskSession } from '../school/hunau/cloudisk';
import {
  BackupNotFoundError,
  readLatestBackup,
  readTimetableRules,
  readDormitory,
  readManualHomework,
  readManualExam,
  readCustomCourseColors,
  withTimetableRules,
  writeBackup,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupDocument,
} from '../school/hunau/backup';
import { fetchExamSchedules, isPendingOrUnfinished, isUpcomingOrToday, type ExamListItem, type ExamSchedule } from '../school/hunau/chaoxing-study';
import { formatBeijing, toIsoUtc } from '../school/hunau/time';
import { DESKTOP_UA, URLS } from '../school/hunau/constants';

// ---- 学期列表归一化 ----
const SEMESTER_ID_KEYS = ['semester', 'semesterId', 'semesterid', 'xqid', 'xqId', 'dm', 'id', 'value', 'code', 'xnxq', 'xnxqid'];
const SEMESTER_NAME_KEYS = ['semesterName', 'semestername', 'xqmc', 'xqMc', 'mc', 'name', 'label', 'text', 'title', 'xnxqmc'];

function pickString(source: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value !== '') return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function normalizeSemesters(data: unknown): Array<{ semester: string; name: string }> {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .map((row) => {
        if (typeof row === 'string' && row !== '') return { semester: row, name: row };
        if (typeof row !== 'object' || row === null) return null;
        const record = row as Record<string, unknown>;
        const semester = pickString(record, SEMESTER_ID_KEYS);
        const name = pickString(record, SEMESTER_NAME_KEYS);
        if (!semester && !name) return null;
        return { semester: semester || name, name: name || semester };
      })
      .filter((item): item is { semester: string; name: string } => item !== null);
  }
  return [];
}

/**
 * 课表查询：一次性拉取全学期 1-20 周课表，并自动从超星云盘拉取最新备份配置，
 * 实时应用调课规则（加课/调课/停课），同时同步下发宿舍房间与手工作业配置。
 *
 * GET /api/academic/timetable
 * GET /api/academic/timetable?full=true
 * GET /api/academic/timetable?week=1&full=false
 */
export async function handleTimetable(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const fullParam = url.searchParams.get('full');
  const weekParam = url.searchParams.get('week');
  const isFull = fullParam !== 'false';

  try {
    const result = await runWithSession(env, creds, async (context) => {
      // 并发启动：移动教务登录 + 读取超星云盘配置备份
      const ydjwxtAuthPromise = loginYdjwxt(context.session, creds.oaId, creds.oaKey);

      const backupPromise = (async () => {
        try {
          const cloudiskAuth = await ensureCloudiskSession(context.session);
          const loaded = await readLatestBackup(context.session, cloudiskAuth);
          const doc = loaded.backup;
          const rules = (readTimetableRules(doc) as TimetableRule[]) || [];
          const dormitory = readDormitory(doc);
          const manualHomework = readManualHomework(doc);
          const manualExam = readManualExam(doc);
          const customCourseColors = readCustomCourseColors(doc);
          return {
            found: true,
            fileName: loaded.entry.name,
            exportedAt: doc.exportedAt,
            rules,
            dormitory,
            manualHomework,
            manualExam,
            customCourseColors,
          };
        } catch (e) {
          console.log('读取云端备份失败或未找到备份:', e instanceof Error ? e.message : e);
          return {
            found: false,
            rules: [] as TimetableRule[],
            dormitory: null,
            manualHomework: [],
            manualExam: [],
            customCourseColors: {},
          };
        }
      })();

      const [ydjwxtAuth, backupInfo] = await Promise.all([ydjwxtAuthPromise, backupPromise]);

      if (!isFull && weekParam) {
        // 单周兼容模式
        const week = Math.max(1, Math.min(30, parseInt(weekParam, 10) || 1));
        let weekData = await fetchTimetableWeek(ydjwxtAuth, week);
        const rules = backupInfo.rules || [];
        if (rules.length > 0) {
          const applied = applyTimetableRules(weekData.courses, rules);
          weekData = {
            ...weekData,
            courses: applied.filter((c) => parseWeeks(c.weeks).includes(week)),
          };
        }
        return {
          ...weekData,
          rulesApplied: rules.length,
          backup: {
            found: backupInfo.found,
            fileName: backupInfo.fileName,
            dormitory: backupInfo.dormitory,
          },
        };
      }

      // 全量拉取 1-20 周课表
      const semesterData = await fetchFullSemesterTimetable(ydjwxtAuth, 20);

      // 应用来自云盘备份的调课规则（加课 -> 调课 -> 停课）
      const rules = backupInfo.rules || [];
      const finalCourses = rules.length > 0
        ? applyTimetableRules(semesterData.allCourses, rules)
        : semesterData.allCourses;

      // 组装 1-20 周课表视图
      const weeks: Record<number, TimetableWeek> = {};
      for (let w = 1; w <= 20; w++) {
        const weekCourses = finalCourses.filter((c) => parseWeeks(c.weeks).includes(w));
        weekCourses.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startPeriod - b.startPeriod);
        weeks[w] = {
          week: w,
          dates: semesterData.datesByWeek.get(w) || [],
          courses: weekCourses,
        };
      }

      // 自动推算当前真实所在周次
      const currentWeek = deriveCurrentWeekFromDates(semesterData.datesByWeek);

      return {
        full: true,
        currentWeek,
        rulesApplied: rules.length,
        totalCourses: finalCourses.length,
        weeks,
        backup: {
          found: backupInfo.found,
          fileName: backupInfo.fileName,
          exportedAt: backupInfo.exportedAt,
          rulesCount: rules.length,
          rules,
          dormitory: backupInfo.dormitory,
          manualHomework: backupInfo.manualHomework,
          manualExam: backupInfo.manualExam,
          customCourseColors: backupInfo.customCourseColors,
        },
      };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '全学期课表获取失败', 500);
  }
}

// ---------------------------------------------------------------------------
// 调课规则写回（调课 / 停课 / 加课）
// ---------------------------------------------------------------------------

/** 合法的规则类型（与 timetable-rules.ts 的 RuleType 一致）。 */
const RULE_TYPES = new Set(['reschedule', 'suspension', 'customCourse']);

/** 单条规则的基本形状校验：id/type/description/createdAt/data 都要在。 */
function isTimetableRule(value: unknown): value is TimetableRule {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record['id'] !== 'string' || record['id'].trim() === '') return false;
  if (typeof record['type'] !== 'string' || !RULE_TYPES.has(record['type'])) return false;
  if (typeof record['description'] !== 'string') return false;
  if (typeof record['createdAt'] !== 'string') return false;
  const data = record['data'];
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  return true;
}

/** 云端没有备份时的兜底文档：调课不能因为「还没同步过」就直接失败。 */
function emptyBackupDocument(): BackupDocument {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {},
    localData: {},
  };
}

/**
 * 写入课表调整规则（整组覆盖）。
 *
 * POST /api/academic/timetable/rules
 * body: { rules: TimetableRule[] }
 *
 * 规则落在云端备份的 `localData.timetableRules`，与手机 App 共用同一份数据；
 * 写回时保留 settings 与其它 localData 字段（见 backup.ts 的 withTimetableRules）。
 */
export async function handleTimetableRules(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求体不是合法 JSON', 400, 'invalid_body');
  }

  const rawRules = payload['rules'];
  if (!Array.isArray(rawRules)) {
    return fail('rules 必须是数组', 400, 'invalid_rules');
  }
  if (!rawRules.every(isTimetableRule)) {
    return fail('rules 里有结构不合法的规则', 400, 'invalid_rules');
  }
  const rules = rawRules as TimetableRule[];

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const auth = await ensureCloudiskSession(context.session);

      // 首次使用调课时云端可能还没有备份 —— 用空文档兜底，而不是让用户先去手机端同步一次
      let doc: BackupDocument;
      let slot: string | null = null;
      try {
        const loaded = await readLatestBackup(context.session, auth);
        doc = loaded.backup;
        slot = loaded.slot;
      } catch (error) {
        if (!(error instanceof BackupNotFoundError)) throw error;
        console.log(
          JSON.stringify({ event: 'timetable_rules_no_backup', fallback: 'empty_document' }),
        );
        doc = emptyBackupDocument();
      }

      const updated = withTimetableRules(doc, rules);
      const written = await writeBackup(context.session, auth, updated, slot);

      return { success: true, rulesCount: rules.length, fileName: written.filename };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '保存课表调整失败', 500);
  }
}

// ---- 成绩与学期解析工具函数 ----
export interface ScoreSummary {
  realName?: string;
  totalCredits?: string;
  totalGradePoints?: string;
  pjxfjd?: string;
}

function extractSummaryFromRawScores(rawScores: unknown): ScoreSummary | null {
  if (!rawScores || typeof rawScores !== 'object') return null;
  const arr = Array.isArray(rawScores)
    ? rawScores
    : Array.isArray((rawScores as any).data)
      ? (rawScores as any).data
      : null;
  if (!arr || arr.length === 0) return null;
  const first = arr[0];
  if (!first || typeof first !== 'object') return null;
  if (first.pjxfjd || first.yxzxf || first.zxfjd) {
    return {
      realName: first.name ? String(first.name) : undefined,
      totalCredits: first.yxzxf ? String(first.yxzxf) : undefined,
      totalGradePoints: first.zxfjd ? String(first.zxfjd) : undefined,
      pjxfjd: first.pjxfjd ? String(first.pjxfjd) : undefined,
    };
  }
  return null;
}

function extractCoursesFromRawScores(rawScores: unknown, semesterLabel: string): any[] {
  if (!rawScores || typeof rawScores !== 'object') return [];

  let rawList: any[] = [];
  const data = (rawScores as any).data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (first && Array.isArray(first.achievement)) {
      rawList = first.achievement;
    } else {
      rawList = data;
    }
  } else if (Array.isArray(rawScores) && rawScores.length > 0) {
    const first = rawScores[0];
    if (first && Array.isArray(first.achievement)) {
      rawList = first.achievement;
    } else {
      rawList = rawScores;
    }
  }

  // 严格过滤：必须包含课程字段，严禁学生档案对象（含 studentID）冒充课程
  const validItems = rawList.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const hasCourseField = Boolean(
      item.courseName ||
      item.kcmc ||
      item.kcbh ||
      item.fraction !== undefined ||
      item.examinationNature,
    );
    const isStudentProfile = item.studentID !== undefined && item.achievement !== undefined;
    return hasCourseField && !isStudentProfile;
  });

  return validItems.map((item: any) => {
    const name = String(item.courseName || item.kcmc || '未知课程').trim();
    const scoreStr = String(item.fraction || item.score || item.cj || item.cjmc || '--').trim();
    const creditStr = String(item.credit || item.xf || '0').trim();
    const nature = String(item.courseNature || item.curriculumAttributes || item.kcxz || '').trim();
    const examType = String(item.examinationNature || '正常考试').trim();
    const courseCode = String(item.kcbh || '').trim();

    // 绩点计算与等级转换
    let gpa = 0;
    const numScore = parseFloat(scoreStr);
    if (!isNaN(numScore)) {
      gpa = numScore >= 60 ? parseFloat(((numScore - 50) / 10).toFixed(1)) : 0;
    } else {
      switch (scoreStr) {
        case '优秀':
          gpa = 4.5;
          break;
        case '良好':
          gpa = 3.5;
          break;
        case '中等':
          gpa = 2.5;
          break;
        case '及格':
        case '合格':
        case '通过':
          gpa = 1.5;
          break;
        default:
          gpa = 0;
          break;
      }
    }

    return {
      name,
      score: scoreStr,
      credit: creditStr,
      gpa: gpa > 0 ? gpa.toFixed(1) : '0.0',
      nature,
      examType,
      courseCode,
      term: semesterLabel,
      raw: item,
    };
  });
}

/**
 * 成绩查询
 * GET /api/academic/scores
 * GET /api/academic/scores?semester=2024-2025-1
 * GET /api/academic/scores?semester=all
 */
export async function handleScores(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const requestedSemester = (url.searchParams.get('semester') || '').trim();

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const ydjwxtAuth = await loginYdjwxt(context.session, creds.oaId, creds.oaKey);
      const rawSemesters = await fetchSemesters(ydjwxtAuth).catch(() => []);
      const normalizedSemesters = normalizeSemesters(rawSemesters);

      // 1. 请求全部历年学期: semester=all
      if (requestedSemester === 'all') {
        let overallSummary: ScoreSummary | null = null;
        const allPromises = normalizedSemesters.map(async (s) => {
          const raw = await fetchScores(ydjwxtAuth, s.semester).catch(() => null);
          if (!overallSummary) {
            overallSummary = extractSummaryFromRawScores(raw);
          }
          return extractCoursesFromRawScores(raw, s.semester);
        });
        const nested = await Promise.all(allPromises);
        const allCourses = nested.flat();
        return {
          semester: 'all',
          isAll: true,
          count: allCourses.length,
          courses: allCourses,
          list: allCourses,
          summary: overallSummary,
        };
      }

      // 2. 指定了具体学期
      if (requestedSemester) {
        const rawScores = await fetchScores(ydjwxtAuth, requestedSemester);
        const courses = extractCoursesFromRawScores(rawScores, requestedSemester);
        return {
          semester: requestedSemester,
          isAll: false,
          count: courses.length,
          courses,
          list: courses,
          summary: extractSummaryFromRawScores(rawScores),
          raw: rawScores,
        };
      }

      // 3. 未传 semester（初始加载）：自动探测并定位到有已出成绩的最新学期
      // 农大教务当前学期（如 2025-2026-2）通常处于进行中、考试未结，成绩为空
      // 自动顺延到有实际成绩记录的最近往期学期（如 2025-2026-1）
      let targetSemester = normalizedSemesters[0]?.semester || '';
      let targetCourses: any[] = [];
      let targetRaw: any = null;
      let overallSummary: ScoreSummary | null = null;

      for (const sem of normalizedSemesters) {
        const raw = await fetchScores(ydjwxtAuth, sem.semester).catch(() => null);
        if (!overallSummary) {
          overallSummary = extractSummaryFromRawScores(raw);
        }
        const courses = extractCoursesFromRawScores(raw, sem.semester);
        if (courses.length > 0) {
          targetSemester = sem.semester;
          targetCourses = courses;
          targetRaw = raw;
          break;
        }
      }

      // 若所有学期均暂无成绩，则默认展示第一学期
      if (targetCourses.length === 0 && normalizedSemesters.length > 0) {
        targetSemester = normalizedSemesters[0].semester;
      }

      return {
        semester: targetSemester,
        isAll: false,
        count: targetCourses.length,
        courses: targetCourses,
        list: targetCourses,
        summary: overallSummary ?? extractSummaryFromRawScores(targetRaw),
        raw: targetRaw,
      };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '成绩获取失败', 500);
  }
}

/**
 * 学期列表查询
 * GET /api/academic/semesters
 */
export async function handleSemesters(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const raw = await runWithSession(env, creds, async (context) => {
      const ydjwxtAuth = await loginYdjwxt(context.session, creds.oaId, creds.oaKey);
      return await fetchSemesters(ydjwxtAuth);
    });

    const semesters = normalizeSemesters(raw);
    return ok(semesters);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '学期列表获取失败', 500);
  }
}

/**
 * 一条待返回的考试（时间可能缺失 —— 原版允许「未定时间」的考试进列表）。
 *
 * `timeMs` 用 NaN 表示「没有可用的开始时间」，与 `isUpcomingOrToday` 的
 * 「非有限数 -> 保留」语义对齐；对外输出时再转成 null。
 */
export interface ExamView {
  id: string;
  title: string;
  courseName: string;
  time: string | null;
  timeLocal: string | null;
  timeMs: number | null;
  status: string;
  studentName: string;
  studentId: string;
  detailUrl: string;
  rawTimeStrs: string[];
}

/**
 * 把「详情页拿到时间的考试」与「详情页没解析出时间的考试」合成最终列表（纯函数）。
 *
 * 移植原版 `ExamService.fetchExams` 的收尾逻辑：
 *   - 没解析出时间的考试**不丢弃**，以「未定时间」进列表（原版同样入库）；
 *   - 只保留开始时间不早于今天 00:00 的（`isUpcomingOrToday`，无时间的天然保留）；
 *   - 有时间的按时间升序，无时间的排最后（原版 `ExamScheduleModel.compareTime`）。
 */
export function buildExamView(
  exams: readonly ExamSchedule[],
  unresolved: readonly ExamListItem[],
  nowMs: number,
): ExamView[] {
  const withTime = exams
    .filter((exam) => isPendingOrUnfinished(exam.status))
    .filter((exam) => isUpcomingOrToday(exam.timeMs, nowMs))
    .map((exam) => toExamView(exam));

  // 列表阶段已按状态过滤过，这里再过一遍是防御：unresolved 可能被别处复用
  const withoutTime = unresolved
    .filter((item) => isPendingOrUnfinished(item.status))
    .map((item) => ({
      id: item.id,
      title: item.title,
      courseName: '',
      time: null,
      timeLocal: null,
      timeMs: null,
      status: item.status || '待考',
      studentName: '',
      studentId: '',
      detailUrl: item.dataUrl,
      rawTimeStrs: [] as string[],
    }));

  const merged = [...withTime, ...withoutTime];
  // 无时间的排最后（NaN 参与比较会破坏排序，所以显式分两段）
  merged.sort((a, b) => {
    if (a.timeMs === null && b.timeMs === null) return 0;
    if (a.timeMs === null) return 1;
    if (b.timeMs === null) return -1;
    return a.timeMs - b.timeMs;
  });
  return merged;
}

function toExamView(exam: ExamSchedule): ExamView {
  const hasTime = Number.isFinite(exam.timeMs);
  return {
    id: exam.id,
    title: exam.title,
    courseName: exam.courseName,
    time: hasTime ? toIsoUtc(exam.timeMs) : null,
    timeLocal: hasTime ? formatBeijing(exam.timeMs) : null,
    // 毫秒时间戳：前端算倒计时不必再解析字符串、也不受时区影响
    timeMs: hasTime ? exam.timeMs : null,
    status: exam.status || '待考',
    studentName: exam.studentName,
    studentId: exam.studentId,
    detailUrl: exam.detailUrl,
    rawTimeStrs: exam.rawTimeStrs,
  };
}

/**
 * 考试日程安排
 * GET /api/academic/exams
 *
 * 只返回「还没开始」的考试，对齐原版 `ExamService.fetchExams` 的两级过滤：
 *   1. 列表阶段用 `isPendingOrUnfinished(status)` 排掉「已完成 / 已结束」，
 *      被排掉的连详情页都不拉（原版也是先过滤再抓详情，省一堆请求）；
 *   2. 详情阶段再用 `isUpcomingOrToday(timeMs)` 只留开始时间在今天 00:00 之后的，
 *      无时间的考试保留（原版 `ExamStorage.isUpcomingOrToday`：`time == null -> true`）。
 *
 * 历史考试不再以 `isPast: true` 的形式混在列表里 —— 前端是「倒计时待考」语义，
 * 混进来只会让人以为还有一场要考。
 */
export async function handleExams(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const keyword = url.searchParams.get('keyword') || '';

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const fetchResult = await fetchExamSchedules(context.session);
      const nowMs = Date.now();

      let list = buildExamView(fetchResult.exams, fetchResult.unresolved, nowMs);

      if (keyword.trim()) {
        const kw = keyword.toLowerCase().trim();
        list = list.filter(
          (e) => e.title.toLowerCase().includes(kw) || e.courseName.toLowerCase().includes(kw),
        );
      }

      return list;
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '考试信息获取失败', 500);
  }
}

// ---- 空教室查询工具函数 ----
async function collectHtmlText(html: string, selector: string): Promise<string[]> {
  if (!html || html.trim() === '') return [];
  const results: string[] = [];
  let buffer: string | null = null;
  try {
    await new HTMLRewriter()
      .on(selector, {
        element() {
          buffer = '';
        },
        text(chunk) {
          if (buffer !== null) buffer += chunk.text;
        },
      })
      // 注意：HTMLRewriter 在处理完单个 tag 后可能需要 onEndTag 或在 element 结束后取值
      .transform(new Response(html))
      .text();
  } catch {}

  // 双保险：若 HTMLRewriter 解析为空，用稳健正则匹配 fallback
  if (results.length === 0) {
    const sectionMatch = html.match(new RegExp(`<[^>]*id=["']${selector.replace('#', '').split(' ')[0]}["'][^>]*>[\\s\\S]*?<\\/div>`, 'i'));
    const containerHtml = sectionMatch ? sectionMatch[0] : html;
    const aRegex = /<a\b[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = aRegex.exec(containerHtml)) !== null) {
      const text = m[1].trim();
      if (text && !results.includes(text)) results.push(text);
    }
  }

  return results.filter(Boolean);
}

async function collectHtmlWithAttribute(
  html: string,
  selector: string,
  attribute: string,
): Promise<Array<{ label: string; value: string }>> {
  if (!html || html.trim() === '') return [];
  const results: Array<{ label: string; value: string }> = [];

  // 正则解析周几与 data-value 属性
  const sectionMatch = html.match(new RegExp(`<[^>]*id=["']${selector.replace('#', '').split(' ')[0]}["'][^>]*>[\\s\\S]*?<\\/div>`, 'i'));
  const containerHtml = sectionMatch ? sectionMatch[0] : html;
  const aRegex = /<a\b[^>]*data-value=["']([^"']*)["'][^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = aRegex.exec(containerHtml)) !== null) {
    const val = m[1].trim();
    const text = m[2].trim();
    if (text) results.push({ label: text, value: val });
  }

  return results;
}

function defaultClassroomOptions() {
  return {
    buildings: [
      '第九教学楼',
      '第十教学楼',
      '第十一教学楼',
      '第十二教学楼',
      '第七教学楼',
      '第二教学楼',
      '修业学堂',
      '第一教学楼',
      '第三教学楼',
      '第五教学楼',
      '第六教学楼',
    ],
    sections: ['0102', '0304', '0506', '0708', '0910'],
    weeks: Array.from({ length: 25 }, (_, i) => String(i + 1)),
    days: [
      { label: '星期一', value: '1' },
      { label: '星期二', value: '2' },
      { label: '星期三', value: '3' },
      { label: '星期四', value: '4' },
      { label: '星期五', value: '5' },
      { label: '星期六', value: '6' },
      { label: '星期日', value: '7' },
    ],
  };
}

/**
 * 空教室查询
 * GET /api/academic/classrooms?building=...&week=...&section=...&day=...
 */
export async function handleClassrooms(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const building = url.searchParams.get('building') || '';
  const week = url.searchParams.get('week') || ''; // 第几周
  const section = url.searchParams.get('section') || ''; // 节次
  const day = url.searchParams.get('day') || ''; // 星期几

  try {
    const result = await runWithSession(env, creds, async (context) => {
      if (!building && !week && !section && !day) {
        // 返回页面 HTML 中的筛选项
        const response = await context.session.get(URLS.portalClassroomIndex, {
          headers: {
            'User-Agent': DESKTOP_UA,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        if (response.status !== 200) {
          throw new Error(`获取查询条件失败（HTTP ${response.status}）`);
        }
        const html = response.body;
        const defaults = defaultClassroomOptions();
        const buildings = await collectHtmlText(html, '#jxlCondition a');
        const sections = await collectHtmlText(html, '#jcCondition a');
        const weeks = await collectHtmlText(html, '#zcCondition a');
        const days = await collectHtmlWithAttribute(html, '#weekCondition a', 'data-value');

        return {
          isOptions: true,
          buildings: buildings.length ? buildings : defaults.buildings,
          sections: sections.length ? sections : defaults.sections,
          weeks: weeks.length ? weeks : defaults.weeks,
          days: days.length ? days : defaults.days,
        };
      }

      const query = new URLSearchParams({
        jxl: building,
        week: day,
        jc: section,
        zc: week,
      });

      const response = await context.session.get(`${URLS.portalClassroomQuery}?${query}`, {
        headers: {
          'User-Agent': DESKTOP_UA,
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: URLS.portalClassroomIndex,
        },
      });

      if (response.status !== 200) {
        throw new Error(`空教室查询失败（HTTP ${response.status}）`);
      }

      let parsed: any;
      try {
        parsed = JSON.parse(response.body);
      } catch {
        throw new Error('空教室接口返回非 JSON 数据');
      }

      const rawList = Array.isArray(parsed?.data)
        ? parsed.data
        : Array.isArray(parsed)
          ? parsed
          : [];

      const classrooms = rawList.map((item: any) => ({
        name: String(item.JSMC || item.name || item.roomName || '').trim(),
        capacity: String(item.ZWS || item.capacity || '0').trim(),
        raw: item,
      }));

      return {
        isOptions: false,
        count: classrooms.length,
        classrooms,
        data: classrooms,
      };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '空教室查询失败', 500);
  }
}

// ---------------------------------------------------------------------------
// 课表 ICS 云端订阅代理（对齐原版 TimetableSubscriptionService + ICS Worker）
//
// 订阅地址：https://ics.chilleast.soilzhu.su/{uuid}/timetable.ics
// 上传 PUT / 删除 DELETE 都要求 `Authorization: Bearer <ICS_API_KEY>`。
//
// 为什么必须经本 Worker 中转而不是浏览器直连：
//   1. 浏览器直连会撞 CORS 预检（ICS 服务的 CORS 只放了 GET）；
//   2. 写入密钥只能放在服务端 —— 放进前端等于公开，谁都能覆盖别人的订阅。
//
// 为什么还要用户 Bearer Token：订阅文件本身是公开的（日历客户端要匿名拉），
// 但「写入」不能对匿名开放，否则任何人只要猜中 uuid 就能篡改别人的课表。
// 这里复用 `extractBearerCredentials`，等于要求「必须是已登录的本校用户」。
// ---------------------------------------------------------------------------

/** 默认订阅服务地址；可用 env.ICS_BASE_URL 覆盖（本地/测试指向 mock）。 */
export const DEFAULT_ICS_BASE_URL = 'https://ics.chilleast.soilzhu.su';

/** 严格 36 位 UUID（与 ICS Worker 的 `/^[0-9a-fA-F-]{36}$/` 路由校验一致）。 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isValidSubscriptionUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** 拼订阅地址（纯函数，便于单测与前端回显）。 */
export function buildSubscriptionUrl(baseUrl: string, uuid: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  return `${base}/${uuid.trim().toLowerCase()}/timetable.ics`;
}

/**
 * 上传课表 ICS 到云端订阅地址。
 * POST /api/academic/timetable/subscription
 * body: { uuid, ics }
 */
export async function handleTimetableSubscription(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求体不是合法 JSON', 400, 'invalid_body');
  }

  const uuid = typeof payload['uuid'] === 'string' ? payload['uuid'].trim() : '';
  const ics = typeof payload['ics'] === 'string' ? payload['ics'] : '';

  if (!isValidSubscriptionUuid(uuid)) {
    return fail('uuid 格式不合法（应为 36 位 UUID）', 400, 'invalid_uuid');
  }
  // 与 ICS Worker 的写入校验保持一致，提前拦下明显不是日历的负载
  if (!ics.includes('BEGIN:VCALENDAR')) {
    return fail('ics 内容不合法（缺少 BEGIN:VCALENDAR）', 400, 'invalid_ics');
  }

  const apiKey = (env.ICS_API_KEY ?? '').trim();
  if (apiKey === '') {
    // 宁可报错也不无鉴权写入：没有钥匙时写进去等于把自己的订阅暴露成公开可改
    return fail('服务端未配置 ICS_API_KEY，暂不能上传课表订阅', 500, 'ics_not_configured');
  }

  const baseUrl = (env.ICS_BASE_URL ?? '').trim() || DEFAULT_ICS_BASE_URL;
  const targetUrl = buildSubscriptionUrl(baseUrl, uuid);

  try {
    const upstream = await fetch(targetUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body: ics,
    });

    if (upstream.status === 401 || upstream.status === 403) {
      return fail('ICS 服务拒绝了写入（密钥无效或已轮换）', 502, 'ics_unauthorized');
    }
    if (!upstream.ok) {
      return fail(`ICS 服务返回 HTTP ${upstream.status}`, 502, 'ics_upstream_error');
    }

    return ok({ success: true, url: targetUrl });
  } catch (error) {
    return fail(
      `上传课表订阅失败：${error instanceof Error ? error.message : String(error)}`,
      502,
      'ics_unreachable',
    );
  }
}

/**
 * 删除云端订阅文件。
 * DELETE /api/academic/timetable/subscription?uuid=...
 *
 * 幂等：ICS 服务删不存在的 key 也返回成功，这里同样把 404 视作「已经没有了」。
 */
export async function handleTimetableSubscriptionDelete(
  request: Request,
  env: Env,
): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const uuid = (new URL(request.url).searchParams.get('uuid') || '').trim();
  if (!isValidSubscriptionUuid(uuid)) {
    return fail('uuid 格式不合法（应为 36 位 UUID）', 400, 'invalid_uuid');
  }

  const apiKey = (env.ICS_API_KEY ?? '').trim();
  if (apiKey === '') {
    return fail('服务端未配置 ICS_API_KEY，暂不能删除课表订阅', 500, 'ics_not_configured');
  }

  const baseUrl = (env.ICS_BASE_URL ?? '').trim() || DEFAULT_ICS_BASE_URL;
  const targetUrl = buildSubscriptionUrl(baseUrl, uuid);

  try {
    const upstream = await fetch(targetUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (upstream.status === 401 || upstream.status === 403) {
      return fail('ICS 服务拒绝了删除（密钥无效或已轮换）', 502, 'ics_unauthorized');
    }
    if (upstream.status === 404) {
      return ok({ success: true });
    }
    if (!upstream.ok) {
      return fail(`ICS 服务返回 HTTP ${upstream.status}`, 502, 'ics_upstream_error');
    }

    return ok({ success: true });
  } catch (error) {
    return fail(
      `删除课表订阅失败：${error instanceof Error ? error.message : String(error)}`,
      502,
      'ics_unreachable',
    );
  }
}
