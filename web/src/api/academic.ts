import { apiRequest } from './client';
import { storage } from '../utils/storage';
import { settings } from '../stores/settings';

export interface TimetableCourse {
  name: string;
  teacher: string;
  classroom: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  periods: string;
  weeks: string;
  ruleTag?: 'custom' | 'rescheduled';
}

export interface TimetableWeek {
  week: number;
  dates: Array<{ weekday: string; date: string }>;
  courses: TimetableCourse[];
}

export interface SemesterItem {
  semester: string;
  name: string;
}

export interface CloudDormitoryInfo {
  areaName?: string;
  buildingName?: string;
  roomName?: string;
  areaId?: string;
  buildingId?: string;
  roomId?: string;
  fullName?: string;
}

export interface FullTimetableResponse {
  full: boolean;
  currentWeek: number;
  rulesApplied: number;
  totalCourses: number;
  weeks: Record<number, TimetableWeek>;
  backup?: {
    found: boolean;
    fileName?: string;
    exportedAt?: string;
    rulesCount?: number;
    rules?: any[];
    dormitory?: CloudDormitoryInfo | null;
    manualHomework?: any[];
    manualExam?: any[];
    customCourseColors?: Record<string, string>;
  };
}

/**
 * 全学期课表（1–20 周 + 调课规则）。
 *
 * 缓存策略（与原版 App 一致）：
 * - 本地优先：若存在本地缓存，秒级返回展示。
 * - 自动同步开启时，后台静默校准并在数据更新时派发 chilleast:timetable-updated。
 * - 自动同步关闭且无本地缓存时，不发网络请求，直接返回 null。
 * - useCache = false 时强制走网络拉取并写入本地缓存。
 */
export async function fetchFullTimetable(useCache = true): Promise<FullTimetableResponse | null> {
  if (useCache) {
    const cached = storage.getFullTimetable();
    if (cached) {
      if (settings.timetableAutoSyncEnabled) {
        apiRequest<FullTimetableResponse>('/api/academic/timetable?full=true')
          .then((fresh) => {
            if (fresh) {
              storage.setFullTimetable(fresh);
              window.dispatchEvent(
                new CustomEvent('chilleast:timetable-updated', { detail: fresh }),
              );
            }
          })
          .catch(() => {});
      }
      return cached;
    }

    // 无本地缓存且自动同步已关闭：不触发网络请求
    if (!settings.timetableAutoSyncEnabled) {
      return null;
    }
  }

  const data = await apiRequest<FullTimetableResponse>('/api/academic/timetable?full=true');
  if (data) {
    storage.setFullTimetable(data);
  }
  return data;
}

/**
 * 课表主动同步：强制从云端拉取并写入本地缓存。
 * 返回 null 表示网络失败（调用方应保留旧缓存继续展示）。
 */
export async function syncFullTimetableFromCloud(): Promise<FullTimetableResponse | null> {
  try {
    const data = await apiRequest<FullTimetableResponse>('/api/academic/timetable?full=true');
    if (data) {
      storage.setFullTimetable(data);
    }
    return data;
  } catch {
    return null;
  }
}

export async function fetchTimetable(week = 1, useCache = true): Promise<TimetableWeek> {
  if (useCache) {
    const cached = storage.getCachedTimetable(week);
    if (cached) {
      // 异步刷新
      apiRequest<TimetableWeek>(`/api/academic/timetable?week=${week}`)
        .then((fresh) => storage.setCachedTimetable(week, fresh))
        .catch(() => {});
      return cached;
    }
  }

  const data = await apiRequest<TimetableWeek>(`/api/academic/timetable?week=${week}`);
  storage.setCachedTimetable(week, data);
  return data;
}

export async function fetchScores(semester = '', useCache = false): Promise<any> {
  if (useCache && !semester) {
    const cached = storage.getCachedScores();
    if (cached && (cached.courses?.length || Array.isArray(cached))) {
      apiRequest(`/api/academic/scores`)
        .then((fresh) => storage.setCachedScores(fresh))
        .catch(() => {});
      return cached;
    }
  }

  const data = await apiRequest(`/api/academic/scores${semester ? `?semester=${encodeURIComponent(semester)}` : ''}`);
  if (data?.courses?.length) {
    storage.setCachedScores(data);
  }
  return data;
}

export async function fetchSemesters(): Promise<SemesterItem[]> {
  return await apiRequest<SemesterItem[]>('/api/academic/semesters');
}

/**
 * 考试安排。
 * 服务端只返回「尚未开始」的考试（对齐原版 ExamService.fetchExams 的过滤），
 * 已完成 / 已结束的历史考试不会出现在这里。
 */
export async function fetchExams(): Promise<any[]> {
  return await apiRequest<any[]>('/api/academic/exams');
}

export async function fetchClassrooms(params: { building?: string; week?: string; section?: string; day?: string } = {}): Promise<any> {
  const q = new URLSearchParams(params as any).toString();
  return await apiRequest(`/api/academic/classrooms${q ? `?${q}` : ''}`);
}

// ---------------------------------------------------------------------------
// 课表 ICS 云端订阅（对齐原版 TimetableSubscriptionService）
//
// 订阅地址：https://ics.chilleast.soilzhu.su/{uuid}/timetable.ics
// 导入日历：webcal://ics.chilleast.soilzhu.su/{uuid}/timetable.ics
//
// 上传/删除走自己的 Worker（服务端转发到 ICS 服务），避免浏览器直连的 CORS
// 预检问题，也避免把订阅服务的密钥放进前端。
// ---------------------------------------------------------------------------

export interface IcsPublishResult {
  success: boolean;
  url: string;
  message?: string;
}

/** 把 ICS 文本推送到云端订阅地址（有则覆盖） */
export async function publishTimetableSubscription(
  uuid: string,
  icsContent: string,
): Promise<IcsPublishResult> {
  return await apiRequest<IcsPublishResult>('/api/academic/timetable/subscription', {
    method: 'POST',
    body: JSON.stringify({ uuid, ics: icsContent }),
  });
}

/** 删除云端订阅文件 */
export async function deleteTimetableSubscription(uuid: string): Promise<boolean> {
  const res = await apiRequest<{ success: boolean }>(
    `/api/academic/timetable/subscription?uuid=${encodeURIComponent(uuid)}`,
    { method: 'DELETE' },
  );
  return Boolean(res?.success);
}
